let editUser = null;
let editCourseId = null;
let lessons = [];          // แคชรายการเนื้อหาของหลักสูตรนี้ เรียงตาม order
let editingLessonId = null; // null = กำลังเพิ่มใหม่, มีค่า = กำลังแก้ไขรายการเดิม
let lessonType = "text";    // 'text' | 'document' — ประเภทที่โมดัลกำลังเปิดอยู่
let pendingDriveFile = null; // ผลลัพธ์ไฟล์ที่อัปโหลดขึ้น Drive แล้ว รอบันทึกเข้ารายการ

guardPage(["instructor"], (user, profile) => {
  renderShell("instructor", "course-manage.html", profile);
  editUser = user;

  const params = new URLSearchParams(window.location.search);
  editCourseId = params.get("id");
  if (editCourseId) {
    document.getElementById("pageTitle").textContent = "แก้ไขหลักสูตร";
    loadCourseBasics();
    unlockContentSection();
    loadLessons();
  }
  lucide.createIcons();
});

// ---------------------------------------------------------
// ขั้นที่ 1: ข้อมูลพื้นฐานหลักสูตร
// ---------------------------------------------------------
function loadCourseBasics() {
  db.collection("courses").doc(editCourseId).get().then(snap => {
    if (!snap.exists) { showToast("ไม่พบหลักสูตรนี้", "error"); return; }
    const c = snap.data();
    document.getElementById("cTitle").value = c.title || "";
    document.getElementById("cDesc").value = c.description || "";
    document.getElementById("cCategory").value = c.category || "";
    document.getElementById("cStatus").value = c.status || "draft";
  });
}

function saveCourse() {
  const title = document.getElementById("cTitle").value.trim();
  if (!title) { showToast("กรุณากรอกชื่อหลักสูตร", "error"); return; }

  const data = {
    title,
    description: document.getElementById("cDesc").value.trim(),
    category: document.getElementById("cCategory").value.trim(),
    status: document.getElementById("cStatus").value,
    ownerUid: editUser.uid,
    ownerName: editUser.displayName || editUser.email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const isNew = !editCourseId;
  const ref = isNew ? db.collection("courses").doc() : db.collection("courses").doc(editCourseId);
  if (isNew) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

  ref.set(data, { merge: true }).then(() => {
    showToast("บันทึกข้อมูลหลักสูตรเรียบร้อย", "success");
    document.getElementById("finishBtn").style.display = "inline-flex";
    if (isNew) {
      // หลักสูตรใหม่ถูกสร้างแล้ว — ปลดล็อกส่วนเนื้อหาต่อได้เลยโดยไม่ต้องออกจากหน้า
      editCourseId = ref.id;
      history.replaceState(null, "", "course-manage.html?id=" + editCourseId);
      document.getElementById("pageTitle").textContent = "แก้ไขหลักสูตร";
      unlockContentSection();
      loadLessons();
    }
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}

function finishEditing() {
  window.location.href = "instructor-courses.html";
}

function unlockContentSection() {
  document.getElementById("contentLockedHint").style.display = "none";
  document.getElementById("contentBody").style.display = "block";
  document.getElementById("finishBtn").style.display = "inline-flex";
}

// ---------------------------------------------------------
// ขั้นที่ 2: เนื้อหาหลักสูตร (courses/{id}/lessons/{lessonId})
// ---------------------------------------------------------
function lessonsRef() {
  return db.collection("courses").doc(editCourseId).collection("lessons");
}

function loadLessons() {
  lessonsRef().orderBy("order", "asc").get().then(snap => {
    lessons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLessons();
  }).catch(err => showToast("โหลดเนื้อหาไม่สำเร็จ: " + err.message, "error"));
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderLessons() {
  const box = document.getElementById("lessonList");
  if (!lessons.length) {
    box.innerHTML = `<div class="empty-state">
        <i data-lucide="layers" style="width:30px;height:30px;color:var(--text3)"></i>
        <div style="margin-top:8px;">ยังไม่มีเนื้อหา — เริ่มเพิ่มเนื้อหาข้อความหรือเอกสารแนบด้านล่าง</div>
      </div>`;
    lucide.createIcons();
    return;
  }
  box.innerHTML = lessons.map((l, i) => {
    const isText = l.type === "text";
    const metaTxt = isText
      ? (stripHtml(l.content).trim().slice(0, 70) || "ยังไม่มีเนื้อหา")
      : (l.fileName || "ไฟล์แนบ");
    return `
    <div class="lesson-item">
      <div class="lesson-order-btns">
        <button ${i === 0 ? "disabled" : ""} onclick="moveLesson(${i},-1)" title="เลื่อนขึ้น"><i data-lucide="chevron-up" style="width:15px;height:15px"></i></button>
        <button ${i === lessons.length - 1 ? "disabled" : ""} onclick="moveLesson(${i},1)" title="เลื่อนลง"><i data-lucide="chevron-down" style="width:15px;height:15px"></i></button>
      </div>
      <div class="lesson-num">${i + 1}</div>
      <div class="lesson-icon ${l.type}"><i data-lucide="${isText ? "align-left" : "file-text"}" style="width:16px;height:16px"></i></div>
      <div class="lesson-info">
        <div class="lesson-title">${escapeHtml(l.title || "(ไม่มีชื่อ)")}</div>
        <div class="lesson-meta">${escapeHtml(metaTxt)}</div>
      </div>
      <div class="lesson-actions">
        ${(!isText && l.fileUrl) ? `<a class="icon-btn" href="${l.fileUrl}" target="_blank" rel="noopener" title="เปิดไฟล์"><i data-lucide="external-link" style="width:15px;height:15px"></i></a>` : ""}
        <button class="icon-btn" onclick="editLesson('${l.id}')" title="แก้ไข"><i data-lucide="pencil" style="width:15px;height:15px"></i></button>
        <button class="icon-btn danger" onclick="deleteLesson('${l.id}')" title="ลบ"><i data-lucide="trash-2" style="width:15px;height:15px"></i></button>
      </div>
    </div>`;
  }).join("");
  lucide.createIcons();
}

// สลับตำแหน่งกับรายการข้างเคียงโดยสลับค่า order (ไม่ต้องเขียนใหม่ทั้งชุด)
function moveLesson(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= lessons.length) return;
  const a = lessons[index], b = lessons[j];
  const batch = db.batch();
  batch.update(lessonsRef().doc(a.id), { order: b.order });
  batch.update(lessonsRef().doc(b.id), { order: a.order });
  batch.commit().then(() => loadLessons())
    .catch(err => showToast("ย้ายลำดับไม่สำเร็จ: " + err.message, "error"));
}

// ---------------------------------------------------------
// โมดัลเพิ่ม/แก้ไขเนื้อหา
// ---------------------------------------------------------
function openLessonModal(type) {
  editingLessonId = null;
  lessonType = type;
  pendingDriveFile = null;
  document.getElementById("lessonModalTitle").textContent = type === "text" ? "เพิ่มเนื้อหาข้อความ" : "เพิ่มเอกสารแนบ";
  document.getElementById("lessonTitle").value = "";
  document.getElementById("lessonEditor").innerHTML = "";
  document.getElementById("lessonTextBlock").style.display = type === "text" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = type === "document" ? "block" : "none";
  resetDocUI();
  document.getElementById("lessonModal").classList.add("open");
  lucide.createIcons();
}

function editLesson(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) return;
  editingLessonId = id;
  lessonType = l.type;
  pendingDriveFile = l.type === "document"
    ? { id: l.fileId, name: l.fileName, webViewLink: l.fileUrl, mimeType: l.fileMimeType, iconLink: l.fileIconLink }
    : null;

  document.getElementById("lessonModalTitle").textContent = l.type === "text" ? "แก้ไขเนื้อหาข้อความ" : "แก้ไขเอกสารแนบ";
  document.getElementById("lessonTitle").value = l.title || "";
  document.getElementById("lessonEditor").innerHTML = l.content || "";
  document.getElementById("lessonTextBlock").style.display = l.type === "text" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = l.type === "document" ? "block" : "none";
  resetDocUI();
  if (l.type === "document" && l.fileName) showDocFileCard(pendingDriveFile);

  document.getElementById("lessonModal").classList.add("open");
  lucide.createIcons();
}

function closeLessonModal() {
  document.getElementById("lessonModal").classList.remove("open");
}

function saveLesson() {
  const title = document.getElementById("lessonTitle").value.trim();
  if (!title) { showToast("กรุณากรอกหัวข้อเนื้อหา", "error"); return; }

  const data = { title, type: lessonType, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (lessonType === "text") {
    const html = document.getElementById("lessonEditor").innerHTML.trim();
    if (!html) { showToast("กรุณากรอกเนื้อหาข้อความ", "error"); return; }
    data.content = html;
  } else {
    if (!pendingDriveFile) { showToast("กรุณาอัปโหลดไฟล์เอกสารก่อนบันทึก", "error"); return; }
    data.fileId = pendingDriveFile.id;
    data.fileName = pendingDriveFile.name;
    data.fileUrl = pendingDriveFile.webViewLink;
    data.fileMimeType = pendingDriveFile.mimeType || "";
    data.fileIconLink = pendingDriveFile.iconLink || "";
  }

  const isNew = !editingLessonId;
  const ref = isNew ? lessonsRef().doc() : lessonsRef().doc(editingLessonId);
  if (isNew) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.order = lessons.length ? (lessons[lessons.length - 1].order + 1) : 1;
  }

  ref.set(data, { merge: true }).then(() => {
    showToast("บันทึกเนื้อหาเรียบร้อย", "success");
    closeLessonModal();
    loadLessons();
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}

function deleteLesson(id) {
  if (!confirm("ต้องการลบเนื้อหานี้หรือไม่? (ไฟล์ที่อัปโหลดไว้บน Google Drive จะไม่ถูกลบ)")) return;
  lessonsRef().doc(id).delete().then(() => {
    showToast("ลบเนื้อหาเรียบร้อย", "success");
    loadLessons();
  }).catch(err => showToast("ลบไม่สำเร็จ: " + err.message, "error"));
}

// ---------------------------------------------------------
// เครื่องมือตกแต่งข้อความ (rich text ผ่าน contenteditable)
// ---------------------------------------------------------
function fmt(cmd) {
  document.getElementById("lessonEditor").focus();
  document.execCommand(cmd, false, null);
}
function fmtBlock(tag) {
  document.getElementById("lessonEditor").focus();
  document.execCommand("formatBlock", false, tag);
}
function fmtLink() {
  const url = prompt("ใส่ลิงก์ (URL):", "https://");
  if (!url) return;
  document.getElementById("lessonEditor").focus();
  document.execCommand("createLink", false, url);
}

// ---------------------------------------------------------
// อัปโหลดเอกสารขึ้น Google Drive (Shared Drive) — ใช้ shared/drive-upload.js
// ---------------------------------------------------------
function resetDocUI() {
  document.getElementById("docFileCard").style.display = "none";
  document.getElementById("docProgressWrap").style.display = "none";
  document.getElementById("lessonFileInput").value = "";
}

function handleFileChosen(e) {
  const file = e.target.files[0];
  if (file) uploadDocFile(file);
}
function handleFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadDocFile(file);
}

function uploadDocFile(file) {
  document.getElementById("docFileCard").style.display = "none";
  document.getElementById("docProgressWrap").style.display = "block";
  document.getElementById("docProgressFill").style.width = "0%";
  document.getElementById("docProgressText").textContent = "กำลังอัปโหลด " + file.name + "...";
  document.getElementById("lessonSaveBtn").disabled = true;

  uploadFileToDrive(file, pct => {
    document.getElementById("docProgressFill").style.width = pct + "%";
    document.getElementById("docProgressText").textContent = "กำลังอัปโหลด... " + pct + "%";
  }).then(res => {
    pendingDriveFile = res;
    document.getElementById("docProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    showDocFileCard(res);
    showToast("อัปโหลดไฟล์ขึ้น Google Drive เรียบร้อย", "success");
  }).catch(err => {
    document.getElementById("docProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    showToast("อัปโหลดไม่สำเร็จ: " + (err.message || err), "error");
  });
}

function showDocFileCard(f) {
  const box = document.getElementById("docFileCard");
  box.style.display = "flex";
  box.innerHTML = `
    <i data-lucide="file-text" style="width:20px;height:20px;color:var(--accent)"></i>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name || "")}</div>
      <div class="hint">อัปโหลดขึ้น Google Drive แล้ว</div>
    </div>
    <button type="button" class="icon-btn" onclick="document.getElementById('lessonFileInput').click()" title="เปลี่ยนไฟล์"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>`;
  lucide.createIcons();
}
