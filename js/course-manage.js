let editUser = null;
let editCourseId = null;
let lessons = [];          // แคชรายการเนื้อหาของหลักสูตรนี้ เรียงตาม order
let editingLessonId = null; // null = กำลังเพิ่มใหม่, มีค่า = กำลังแก้ไขรายการเดิม
let lessonType = "content"; // 'content' (ข้อความ+เอกสารแนบในบทเดียวกัน) | 'video' | 'quiz' — ประเภทที่โมดัลกำลังเปิดอยู่
                             // (ค่าเก่า 'text' / 'document' ยังอ่าน/แก้ไขได้ แต่บันทึกใหม่จะรวมเป็น 'content' เสมอ)
let pendingAttachments = []; // ไฟล์เอกสาร/รูปภาพที่อัปโหลดขึ้น Drive แล้ว รอบันทึกเข้ารายการ (แนบได้หลายไฟล์)
let savedEditorRange = null; // ตำแหน่งเคอร์เซอร์ในกล่องเนื้อหาข้อความ ก่อนเปิด file picker เลือกรูป
let videoMode = "link";      // 'link' (YouTube/Vimeo) | 'upload' (ไฟล์วิดีโอขึ้น Drive)
let pendingDriveVideoFile = null; // ผลลัพธ์ไฟล์วิดีโอที่อัปโหลดขึ้น Drive แล้ว รอบันทึกเข้ารายการ
let existingCoverUrl = null;  // coverUrl เดิมที่โหลดมาจาก Firestore (ถ้ามี)
let pendingCoverFile = null;  // ไฟล์รูปปกใหม่ที่ผู้ใช้เพิ่งเลือก รออัปโหลดตอนกดบันทึก
let coverRemoved = false;     // ผู้ใช้กดลบรูปปกเดิม (ยังไม่ได้กดบันทึก)
let quizQuestions = [];      // แคชคำถามแบบทดสอบที่กำลังแก้ไขอยู่ในโมดัล
                              // แต่ละข้อ: { text, options: [string,...], correct: index }

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
    document.getElementById("cCode").value = c.code || "";
    document.getElementById("cTitle").value = c.title || "";
    document.getElementById("cDesc").value = c.description || "";
    document.getElementById("cCategory").value = c.category || "";
    document.getElementById("cStatus").value = c.status || "draft";
    existingCoverUrl = c.coverUrl || null;
    pendingCoverFile = null;
    coverRemoved = false;
    renderCoverPreview();
  });
}

// ---------------------------------------------------------
// ปกหลักสูตร — อัปโหลดตรงขึ้น Firebase Storage (course-covers/{courseId}/...)
// เลือกไฟล์ไว้ก่อน แสดงตัวอย่างทันที แต่จะอัปโหลดจริงตอนกด "บันทึกข้อมูลหลักสูตร"
// ---------------------------------------------------------
function handleCoverFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error"); return; }
  if (file.size > 5 * 1024 * 1024) { showToast("ขนาดรูปต้องไม่เกิน 5MB", "error"); return; }
  pendingCoverFile = file;
  coverRemoved = false;
  renderCoverPreview();
}

function removeCoverImage() {
  pendingCoverFile = null;
  coverRemoved = true;
  document.getElementById("coverFileInput").value = "";
  renderCoverPreview();
}

function renderCoverPreview() {
  const box = document.getElementById("coverPreviewBox");
  const removeBtn = document.getElementById("coverRemoveBtn");
  if (pendingCoverFile) {
    const url = URL.createObjectURL(pendingCoverFile);
    box.innerHTML = `<img src="${url}" alt="">`;
    removeBtn.style.display = "inline-flex";
  } else if (existingCoverUrl && !coverRemoved) {
    box.innerHTML = `<img src="${existingCoverUrl}" alt="" onerror="this.parentElement.innerHTML='<i data-lucide=\\'image-off\\' style=\\'width:26px;height:26px\\'></i>';if(window.lucide)lucide.createIcons();">`;
    removeBtn.style.display = "inline-flex";
  } else {
    box.innerHTML = `<i data-lucide="image" style="width:30px;height:30px"></i>`;
    removeBtn.style.display = "none";
  }
  lucide.createIcons();
}

function saveCourse() {
  const code = document.getElementById("cCode").value.trim();
  const title = document.getElementById("cTitle").value.trim();
  if (!code) { showToast("กรุณากรอกรหัสหลักสูตร", "error"); return; }
  if (!title) { showToast("กรุณากรอกชื่อหลักสูตร", "error"); return; }

  const data = {
    code,
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
  const courseIdForCover = isNew ? ref.id : editCourseId;

  const saveBtn = document.querySelector('[onclick="saveCourse()"]');
  if (saveBtn) saveBtn.disabled = true;

  // บันทึกข้อมูลพื้นฐานก่อน เพื่อให้เอกสารหลักสูตรมีอยู่จริงแล้ว
  // (Cloud Function ต้องอ่านเอกสารนี้เพื่อหา/สร้างโฟลเดอร์ Drive ของหลักสูตรนี้ตอนอัปโหลดรูปปก)
  ref.set(data, { merge: true })
    .then(() => uploadPendingCoverIfAny(courseIdForCover))
    .then(driveFile => {
      if (driveFile) {
        if (!driveFile.imageUrl) {
          // อัปโหลดขึ้น Drive สำเร็จแต่ไม่ได้ลิงก์รูปกลับมา — มักเกิดจาก Google Drive API
          // ยังไม่เปิดใช้งาน หรือ Cloud Function ที่ deploy อยู่เป็นเวอร์ชันเก่ากว่าโค้ดฝั่งเว็บ
          // โยน error แทนที่จะเซฟ coverUrl เป็น undefined (Firestore ไม่ยอมรับค่านี้)
          throw new Error("อัปโหลดรูปปกขึ้น Google Drive สำเร็จ แต่ไม่ได้ลิงก์รูปกลับมา — ตรวจสอบว่าเปิดใช้งาน Google Drive API และ deploy Cloud Function เวอร์ชันล่าสุดแล้ว (firebase deploy --only functions,storage)");
        }
        return ref.set({ coverUrl: driveFile.imageUrl, coverDriveFileId: driveFile.id }, { merge: true });
      } else if (coverRemoved) {
        return ref.set({
          coverUrl: firebase.firestore.FieldValue.delete(),
          coverDriveFileId: firebase.firestore.FieldValue.delete()
        }, { merge: true });
      }
    })
    .then(() => {
      showToast("บันทึกข้อมูลหลักสูตรเรียบร้อย", "success");
      document.getElementById("finishBtn").style.display = "inline-flex";
      pendingCoverFile = null;
      coverRemoved = false;
      if (isNew) {
        // หลักสูตรใหม่ถูกสร้างแล้ว — ปลดล็อกส่วนเนื้อหาต่อได้เลยโดยไม่ต้องออกจากหน้า
        editCourseId = ref.id;
        history.replaceState(null, "", "course-manage.html?id=" + editCourseId);
        document.getElementById("pageTitle").textContent = "แก้ไขหลักสูตร";
        unlockContentSection();
        loadLessons();
      }
      loadCourseBasics(); // โหลดค่า coverUrl ล่าสุดกลับมาแสดง
    })
    .catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"))
    .finally(() => { if (saveBtn) saveBtn.disabled = false; });
}

// อัปโหลดรูปปกที่เพิ่งเลือกไว้ (ถ้ามี) ขึ้น Google Drive โฟลเดอร์เดียวกับไฟล์เนื้อหาของหลักสูตรนี้
// ผ่าน pipeline เดียวกับ shared/drive-upload.js (kind="cover") แล้วคืน driveFile ที่มี imageUrl
// ถ้าไม่มีไฟล์ใหม่ คืน Promise<null> (ไม่แตะรูปปกเดิม)
function uploadPendingCoverIfAny(courseId) {
  if (!pendingCoverFile) return Promise.resolve(null);
  document.getElementById("coverProgressWrap").style.display = "block";
  document.getElementById("coverProgressFill").style.width = "0%";
  document.getElementById("coverProgressText").textContent = "กำลังอัปโหลดรูปปกขึ้น Google Drive...";

  return uploadFileToDrive(pendingCoverFile, courseId, pct => {
    document.getElementById("coverProgressFill").style.width = pct + "%";
    document.getElementById("coverProgressText").textContent = "กำลังอัปโหลด... " + pct + "%";
  }, "cover").then(driveFile => {
    document.getElementById("coverProgressWrap").style.display = "none";
    return driveFile;
  }).catch(err => {
    document.getElementById("coverProgressWrap").style.display = "none";
    throw new Error("อัปโหลดรูปปกไม่สำเร็จ: " + (err.message || err));
  });
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
    const isContent = l.type === "content" || l.type === "text" || l.type === "document";
    const isQuiz = l.type === "quiz";
    const isVideo = l.type === "video";

    // จำนวนไฟล์แนบ: รองรับทั้งรูปแบบใหม่ (attachments[]) และรูปแบบเก่า (document เดี่ยว)
    const attachments = l.attachments || (l.type === "document" && l.fileName
      ? [{ name: l.fileName, mimeType: l.fileMimeType, url: l.fileUrl }] : []);
    const hasText = !!stripHtml(l.content).trim();
    const icon = isQuiz ? "help-circle" : isVideo ? "video"
      : (hasText && attachments.length) ? "layers"
      : attachments.length ? "paperclip"
      : "align-left";

    let metaTxt;
    if (isQuiz) {
      metaTxt = `${(l.questions || []).length} คำถาม · ผ่านที่ ${l.passScore != null ? l.passScore : 70}%`;
    } else if (isVideo) {
      metaTxt = l.videoMode === "upload" ? `วิดีโอ (ไฟล์: ${l.videoFileName || "-"})` : `วิดีโอ (ลิงก์: ${l.videoSourceUrl || l.videoUrl || "-"})`;
    } else {
      const parts = [];
      if (hasText) parts.push(stripHtml(l.content).trim().slice(0, 55));
      if (attachments.length) parts.push(`แนบ ${attachments.length} ไฟล์`);
      metaTxt = parts.length ? parts.join(" · ") : "ยังไม่มีเนื้อหา";
    }

    return `
    <div class="lesson-item">
      <div class="lesson-order-btns">
        <button ${i === 0 ? "disabled" : ""} onclick="moveLesson(${i},-1)" title="เลื่อนขึ้น"><i data-lucide="chevron-up" style="width:15px;height:15px"></i></button>
        <button ${i === lessons.length - 1 ? "disabled" : ""} onclick="moveLesson(${i},1)" title="เลื่อนลง"><i data-lucide="chevron-down" style="width:15px;height:15px"></i></button>
      </div>
      <div class="lesson-num">${i + 1}</div>
      <div class="lesson-icon ${isContent ? "content" : l.type}"><i data-lucide="${icon}" style="width:16px;height:16px"></i></div>
      <div class="lesson-info">
        <div class="lesson-title">${escapeHtml(l.title || "(ไม่มีชื่อ)")}</div>
        <div class="lesson-meta">${escapeHtml(metaTxt)}</div>
      </div>
      <div class="lesson-actions">
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
  pendingAttachments = [];
  const titles = { content: "เพิ่มเนื้อหา (ข้อความ + เอกสาร/รูปภาพ)", video: "เพิ่มวิดีโอ", quiz: "เพิ่มแบบทดสอบ" };
  document.getElementById("lessonModalTitle").textContent = titles[type] || "เพิ่มเนื้อหา";
  document.getElementById("lessonTitle").value = "";
  document.getElementById("lessonEditor").innerHTML = "";
  document.getElementById("lessonTextBlock").style.display = type === "content" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = type === "content" ? "block" : "none";
  document.getElementById("lessonVideoBlock").style.display = type === "video" ? "block" : "none";
  document.getElementById("lessonQuizBlock").style.display = type === "quiz" ? "block" : "none";
  resetDocUI();
  if (type === "video") {
    pendingDriveVideoFile = null;
    document.getElementById("videoUrlInput").value = "";
    resetVideoUI();
    setVideoMode("link");
  }
  if (type === "quiz") {
    quizQuestions = [];
    document.getElementById("quizPassScore").value = 70;
    renderQuizQuestions();
  }
  document.getElementById("lessonModal").classList.add("open");
  lucide.createIcons();
}

function editLesson(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) return;
  editingLessonId = id;
  // ค่าเก่า 'text'/'document' ถือเป็น 'content' เสมอตอนแก้ไข (รวมข้อความ+ไฟล์แนบเป็นบทเดียวกัน)
  // — บันทึกซ้ำจะย้ายข้อมูลไปรูปแบบใหม่โดยอัตโนมัติ
  lessonType = (l.type === "video" || l.type === "quiz") ? l.type : "content";

  if (Array.isArray(l.attachments)) {
    pendingAttachments = l.attachments.map(a => ({ ...a, webViewLink: a.url || a.webViewLink }));
  } else if (l.type === "document" && l.fileName) {
    pendingAttachments = [{ id: l.fileId, name: l.fileName, webViewLink: l.fileUrl, mimeType: l.fileMimeType, iconLink: l.fileIconLink }];
  } else {
    pendingAttachments = [];
  }

  const titles = { content: "แก้ไขเนื้อหา", video: "แก้ไขวิดีโอ", quiz: "แก้ไขแบบทดสอบ" };
  document.getElementById("lessonModalTitle").textContent = titles[lessonType] || "แก้ไขเนื้อหา";
  document.getElementById("lessonTitle").value = l.title || "";
  document.getElementById("lessonEditor").innerHTML = l.content || "";
  document.getElementById("lessonTextBlock").style.display = lessonType === "content" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = lessonType === "content" ? "block" : "none";
  document.getElementById("lessonVideoBlock").style.display = lessonType === "video" ? "block" : "none";
  document.getElementById("lessonQuizBlock").style.display = lessonType === "quiz" ? "block" : "none";
  resetDocUI(true);
  if (l.type === "video") {
    resetVideoUI();
    if (l.videoMode === "upload") {
      pendingDriveVideoFile = { id: l.videoFileId, name: l.videoFileName, embedUrl: l.videoUrl };
      setVideoMode("upload");
      showVideoFileCard(pendingDriveVideoFile);
    } else {
      pendingDriveVideoFile = null;
      setVideoMode("link");
      document.getElementById("videoUrlInput").value = l.videoSourceUrl || "";
    }
  }
  if (l.type === "quiz") {
    quizQuestions = JSON.parse(JSON.stringify(l.questions || []));
    document.getElementById("quizPassScore").value = l.passScore != null ? l.passScore : 70;
    renderQuizQuestions();
  }

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

  if (lessonType === "content") {
    const html = document.getElementById("lessonEditor").innerHTML.trim();
    const hasHtmlContent = !!stripHtml(html).trim() || /<img/i.test(html);
    if (!hasHtmlContent && !pendingAttachments.length) {
      showToast("กรุณาใส่เนื้อหาข้อความ หรือแนบไฟล์เอกสาร/รูปภาพอย่างน้อย 1 อย่าง", "error");
      return;
    }
    data.content = hasHtmlContent ? html : "";
    data.attachments = pendingAttachments.map(f => ({
      id: f.id || null,
      name: f.name || "",
      url: f.webViewLink || f.url || "",
      mimeType: f.mimeType || "",
      iconLink: f.iconLink || "",
      previewUrl: f.previewUrl || null,
      imageUrl: f.imageUrl || null
    }));
    // เคลียร์ฟิลด์รูปแบบเก่า (ถ้าเดิมเป็นบทเรียนแบบ 'document' เดี่ยว) ไม่ให้ข้อมูลซ้ำซ้อนค้างอยู่
    data.fileId = firebase.firestore.FieldValue.delete();
    data.fileName = firebase.firestore.FieldValue.delete();
    data.fileUrl = firebase.firestore.FieldValue.delete();
    data.fileMimeType = firebase.firestore.FieldValue.delete();
    data.fileIconLink = firebase.firestore.FieldValue.delete();
  } else if (lessonType === "video") {
    data.videoMode = videoMode;
    if (videoMode === "link") {
      const raw = document.getElementById("videoUrlInput").value.trim();
      if (!raw) { showToast("กรุณาใส่ลิงก์วิดีโอ", "error"); return; }
      const embed = toEmbeddableVideoUrl(raw);
      if (!embed) { showToast("ลิงก์วิดีโอไม่ถูกต้อง — รองรับเฉพาะลิงก์ YouTube หรือ Vimeo เท่านั้น", "error"); return; }
      data.videoUrl = embed;
      data.videoSourceUrl = raw;
      data.videoFileId = firebase.firestore.FieldValue.delete();
      data.videoFileName = firebase.firestore.FieldValue.delete();
    } else {
      if (!pendingDriveVideoFile) { showToast("กรุณาอัปโหลดไฟล์วิดีโอก่อนบันทึก", "error"); return; }
      data.videoUrl = pendingDriveVideoFile.embedUrl;
      data.videoFileId = pendingDriveVideoFile.id;
      data.videoFileName = pendingDriveVideoFile.name;
      data.videoSourceUrl = firebase.firestore.FieldValue.delete();
    }
  } else if (lessonType === "quiz") {
    const passScore = Number(document.getElementById("quizPassScore").value);
    if (!passScore || passScore < 1 || passScore > 100) { showToast("กรุณากรอกเกณฑ์ผ่านเป็นตัวเลข 1-100", "error"); return; }
    if (!quizQuestions.length) { showToast("กรุณาเพิ่มอย่างน้อย 1 คำถาม", "error"); return; }
    for (let i = 0; i < quizQuestions.length; i++) {
      const q = quizQuestions[i];
      if (!q.text.trim()) { showToast(`กรุณากรอกคำถามข้อที่ ${i + 1}`, "error"); return; }
      if (q.options.length < 2 || q.options.some(o => !o.trim())) { showToast(`กรุณากรอกตัวเลือกให้ครบข้อที่ ${i + 1}`, "error"); return; }
      if (q.correct == null || q.correct < 0 || q.correct >= q.options.length) { showToast(`กรุณาเลือกเฉลยข้อที่ ${i + 1}`, "error"); return; }
    }
    data.questions = quizQuestions;
    data.passScore = passScore;
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
// ตัวสร้างแบบทดสอบ (courses/{id}/lessons/{lessonId} type='quiz')
// quizQuestions: [{ text, options:[string,...], correct: index }]
// เกณฑ์ผ่าน (passScore) เก็บแยกไว้ที่ตัวหลักสูตร/บทเรียน ผู้เรียนทำซ้ำได้ไม่จำกัดครั้ง
// (การตรวจ/บันทึกคะแนนจริงจะอยู่ในหน้าเรียน course-player ที่จะเพิ่มภายหลัง)
// ---------------------------------------------------------
function addQuizQuestion() {
  quizQuestions.push({ text: "", options: ["", ""], correct: 0 });
  renderQuizQuestions();
}

function removeQuizQuestion(qi) {
  quizQuestions.splice(qi, 1);
  renderQuizQuestions();
}

function updateQuizQuestionText(qi, val) {
  quizQuestions[qi].text = val;
}

function addQuizOption(qi) {
  if (quizQuestions[qi].options.length >= 6) { showToast("เพิ่มตัวเลือกได้สูงสุด 6 ข้อ", "error"); return; }
  quizQuestions[qi].options.push("");
  renderQuizQuestions();
}

function removeQuizOption(qi, oi) {
  const q = quizQuestions[qi];
  if (q.options.length <= 2) { showToast("ต้องมีอย่างน้อย 2 ตัวเลือก", "error"); return; }
  q.options.splice(oi, 1);
  if (q.correct === oi) q.correct = 0;
  else if (q.correct > oi) q.correct -= 1;
  renderQuizQuestions();
}

function updateQuizOptionText(qi, oi, val) {
  quizQuestions[qi].options[oi] = val;
}

function setQuizCorrect(qi, oi) {
  quizQuestions[qi].correct = oi;
  renderQuizQuestions();
}

function renderQuizQuestions() {
  const box = document.getElementById("quizQuestionList");
  if (!quizQuestions.length) {
    box.innerHTML = `<div class="empty-state">
        <i data-lucide="help-circle" style="width:26px;height:26px;color:var(--text3)"></i>
        <div style="margin-top:8px;">ยังไม่มีคำถาม — กดปุ่ม "เพิ่มคำถาม" ด้านล่างเพื่อเริ่ม</div>
      </div>`;
    lucide.createIcons();
    return;
  }
  box.innerHTML = quizQuestions.map((q, qi) => `
    <div class="quiz-question-card">
      <div class="quiz-question-head">
        <span class="qnum">คำถามข้อที่ ${qi + 1}</span>
        <button type="button" class="icon-btn danger" onclick="removeQuizQuestion(${qi})" title="ลบคำถามนี้"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
      </div>
      <input type="text" placeholder="พิมพ์คำถาม..." value="${escapeHtml(q.text)}"
        oninput="updateQuizQuestionText(${qi}, this.value)">
      ${q.options.map((opt, oi) => `
        <div class="quiz-option-row ${q.correct === oi ? "correct" : ""}">
          <input type="radio" name="qcorrect_${qi}" ${q.correct === oi ? "checked" : ""} onchange="setQuizCorrect(${qi}, ${oi})" title="ตั้งเป็นเฉลย">
          <span class="quiz-option-letter">${String.fromCharCode(65 + oi)}</span>
          <input type="text" placeholder="ตัวเลือกที่ ${oi + 1}" value="${escapeHtml(opt)}" oninput="updateQuizOptionText(${qi}, ${oi}, this.value)">
          ${q.options.length > 2 ? `<button type="button" class="icon-btn danger" onclick="removeQuizOption(${qi},${oi})" title="ลบตัวเลือกนี้"><i data-lucide="x" style="width:14px;height:14px"></i></button>` : ""}
        </div>`).join("")}
      <button type="button" class="btn-secondary" style="margin-top:10px;padding:6px 12px;font-size:12.5px;" onclick="addQuizOption(${qi})"><i data-lucide="plus" style="width:13px;height:13px"></i>เพิ่มตัวเลือก</button>
    </div>`).join("");
  lucide.createIcons();
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
function resetDocUI(keepAttachments) {
  if (!keepAttachments) pendingAttachments = [];
  document.getElementById("docProgressWrap").style.display = "none";
  document.getElementById("lessonFileInput").value = "";
  renderAttachmentList();
}

function handleFileChosen(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) uploadDocFile(file);
}
function handleFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadDocFile(file);
}

// อัปโหลดไฟล์แนบ 1 ไฟล์ขึ้น Drive แล้วเพิ่มเข้ารายการไฟล์แนบของบทเรียนนี้ (แนบได้หลายไฟล์ต่อเนื่อง)
function uploadDocFile(file) {
  if (!editCourseId) { showToast("กรุณาบันทึกข้อมูลหลักสูตรก่อนแนบไฟล์", "error"); return; }
  document.getElementById("docProgressWrap").style.display = "block";
  document.getElementById("docProgressFill").style.width = "0%";
  document.getElementById("docProgressText").textContent = "กำลังอัปโหลด " + file.name + "...";
  document.getElementById("lessonSaveBtn").disabled = true;

  uploadFileToDrive(file, editCourseId, pct => {
    document.getElementById("docProgressFill").style.width = pct + "%";
    document.getElementById("docProgressText").textContent = "กำลังอัปโหลด... " + pct + "%";
  }).then(res => {
    pendingAttachments.push(res);
    document.getElementById("docProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    renderAttachmentList();
    showToast("อัปโหลดไฟล์ขึ้น Google Drive เรียบร้อย", "success");
  }).catch(err => {
    document.getElementById("docProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    showToast("อัปโหลดไม่สำเร็จ: " + (err.message || err), "error");
  });
}

function removeAttachment(idx) {
  pendingAttachments.splice(idx, 1);
  renderAttachmentList();
}

// แสดงรายการไฟล์แนบทั้งหมดของบทเรียนนี้ (pendingAttachments) — แต่ละไฟล์ลบออกเป็นรายไฟล์ได้
function renderAttachmentList() {
  const box = document.getElementById("docAttachmentList");
  if (!pendingAttachments.length) { box.innerHTML = ""; return; }
  box.innerHTML = pendingAttachments.map((f, i) => {
    const isImage = (f.mimeType || "").startsWith("image/");
    const isPdf = f.mimeType === "application/pdf";
    const icon = isImage ? "image" : isPdf ? "file-text" : "paperclip";
    const typeLabel = isImage ? "รูปภาพ" : isPdf ? "เอกสาร PDF (แสดงในหน้าเรียนได้ทันที)" : "ไฟล์เอกสาร";
    const link = f.webViewLink || f.url;
    return `
    <div class="doc-file-card">
      <i data-lucide="${icon}" style="width:20px;height:20px;color:${isImage ? "var(--c-sky-deep)" : "var(--accent)"}"></i>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name || "")}</div>
        <div class="hint">${typeLabel}${link ? ` · <a href="${link}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:700;">ดูตัวอย่าง</a>` : ""}</div>
      </div>
      <button type="button" class="icon-btn danger" onclick="removeAttachment(${i})" title="ลบไฟล์นี้"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
    </div>`;
  }).join("");
  lucide.createIcons();
}

// ---------------------------------------------------------
// แทรกรูปภาพในเนื้อหาข้อความ (rich editor) — อัปโหลดขึ้น Google Drive
// (kind="image" ทำให้ Cloud Function เปิดสิทธิ์สาธารณะ + คืน imageUrl ที่ใช้เป็น <img src=""> ได้ตรงๆ)
// ---------------------------------------------------------
function insertLessonImage() {
  if (!editCourseId) { showToast("กรุณาบันทึกข้อมูลหลักสูตรก่อนแทรกรูปภาพ", "error"); return; }
  const editor = document.getElementById("lessonEditor");
  editor.focus();
  const sel = window.getSelection();
  savedEditorRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
  document.getElementById("lessonImageInput").click();
}

function handleLessonImageChosen(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error"); return; }
  if (file.size > 5 * 1024 * 1024) { showToast("ขนาดรูปต้องไม่เกิน 5MB", "error"); return; }

  const editor = document.getElementById("lessonEditor");
  editor.focus();
  const sel = window.getSelection();
  if (savedEditorRange) { sel.removeAllRanges(); sel.addRange(savedEditorRange); }

  const placeholderId = "img-uploading-" + Date.now();
  document.execCommand("insertHTML", false,
    `<span id="${placeholderId}" class="editor-img-uploading">กำลังอัปโหลดรูปภาพ...</span>&nbsp;`);

  document.getElementById("lessonSaveBtn").disabled = true;
  uploadFileToDrive(file, editCourseId, () => {}, "image").then(driveFile => {
    const span = document.getElementById(placeholderId);
    const imgHtml = `<img src="${driveFile.imageUrl}" alt="${escapeHtml(file.name)}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;">`;
    if (span) span.outerHTML = imgHtml;
    showToast("แทรกรูปภาพเรียบร้อย", "success");
  }).catch(err => {
    const span = document.getElementById(placeholderId);
    if (span) span.remove();
    showToast("แทรกรูปภาพไม่สำเร็จ: " + (err.message || err), "error");
  }).finally(() => {
    document.getElementById("lessonSaveBtn").disabled = false;
  });
}

// ---------------------------------------------------------
// วิดีโอ — 2 โหมด: 'link' (แนะนำ ฝัง YouTube/Vimeo) หรือ 'upload' (ไฟล์ขึ้น Google Drive)
// ---------------------------------------------------------
function setVideoMode(mode) {
  videoMode = mode === "upload" ? "upload" : "link";
  document.getElementById("videoModeLinkBtn").classList.toggle("mode-active", videoMode === "link");
  document.getElementById("videoModeUploadBtn").classList.toggle("mode-active", videoMode === "upload");
  document.getElementById("videoLinkBlock").style.display = videoMode === "link" ? "block" : "none";
  document.getElementById("videoUploadBlock").style.display = videoMode === "upload" ? "block" : "none";
}

// แปลงลิงก์ YouTube/Vimeo รูปแบบต่างๆ ให้เป็นลิงก์ embed ที่ใช้ใน <iframe> ได้ตรงๆ
// คืนค่า null ถ้าไม่ใช่ลิงก์ที่รองรับ
function toEmbeddableVideoUrl(raw) {
  let u;
  try { u = new URL((raw || "").trim()); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.pathname.startsWith("/embed/")) return u.toString();
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return u.toString();

  return null;
}

function resetVideoUI() {
  document.getElementById("videoFileCard").style.display = "none";
  document.getElementById("videoProgressWrap").style.display = "none";
  document.getElementById("lessonVideoFileInput").value = "";
}

function handleVideoFileChosen(e) {
  const file = e.target.files[0];
  if (file) uploadVideoFile(file);
}
function handleVideoFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadVideoFile(file);
}

function uploadVideoFile(file) {
  if (!editCourseId) { showToast("กรุณาบันทึกข้อมูลหลักสูตรก่อนอัปโหลดวิดีโอ", "error"); return; }
  if (!file.type.startsWith("video/")) { showToast("กรุณาเลือกไฟล์วิดีโอเท่านั้น", "error"); return; }

  document.getElementById("videoFileCard").style.display = "none";
  document.getElementById("videoProgressWrap").style.display = "block";
  document.getElementById("videoProgressFill").style.width = "0%";
  document.getElementById("videoProgressText").textContent = "กำลังอัปโหลด " + file.name + "...";
  document.getElementById("lessonSaveBtn").disabled = true;

  uploadFileToDrive(file, editCourseId, pct => {
    document.getElementById("videoProgressFill").style.width = pct + "%";
    document.getElementById("videoProgressText").textContent = pct < 100
      ? "กำลังอัปโหลด... " + pct + "%"
      : "กำลังประมวลผลบน Google Drive...";
  }, "video").then(res => {
    pendingDriveVideoFile = res;
    document.getElementById("videoProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    showVideoFileCard(res);
    showToast("อัปโหลดวิดีโอขึ้น Google Drive เรียบร้อย", "success");
  }).catch(err => {
    document.getElementById("videoProgressWrap").style.display = "none";
    document.getElementById("lessonSaveBtn").disabled = false;
    showToast("อัปโหลดวิดีโอไม่สำเร็จ: " + (err.message || err), "error");
  });
}

function showVideoFileCard(f) {
  const box = document.getElementById("videoFileCard");
  box.style.display = "flex";
  box.innerHTML = `
    <i data-lucide="video" style="width:20px;height:20px;color:var(--c-amber-deep)"></i>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name || "")}</div>
      <div class="hint">ไฟล์วิดีโอ — อัปโหลดขึ้น Google Drive แล้ว</div>
    </div>
    <button type="button" class="icon-btn" onclick="document.getElementById('lessonVideoFileInput').click()" title="เปลี่ยนไฟล์"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>`;
  lucide.createIcons();
}
