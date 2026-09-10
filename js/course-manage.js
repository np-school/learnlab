let editUser = null;
let editCourseId = null;
let lessons = [];          // แคชรายการเนื้อหาของหลักสูตรนี้ เรียงตาม order
let editingLessonId = null; // null = กำลังเพิ่มใหม่, มีค่า = กำลังแก้ไขรายการเดิม
let lessonType = "text";    // 'text' | 'document' | 'quiz' — ประเภทที่โมดัลกำลังเปิดอยู่
let pendingDriveFile = null; // ผลลัพธ์ไฟล์ที่อัปโหลดขึ้น Drive แล้ว รอบันทึกเข้ารายการ
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
    const isText = l.type === "text";
    const isQuiz = l.type === "quiz";
    const isImage = l.type === "document" && (l.fileMimeType || "").startsWith("image/");
    const icon = isText ? "align-left" : isQuiz ? "help-circle" : isImage ? "image" : "file-text";
    const metaTxt = isText
      ? (stripHtml(l.content).trim().slice(0, 70) || "ยังไม่มีเนื้อหา")
      : isQuiz
      ? `${(l.questions || []).length} คำถาม · ผ่านที่ ${l.passScore != null ? l.passScore : 70}%`
      : (l.fileName || (isImage ? "รูปภาพ" : "ไฟล์แนบ"));
    return `
    <div class="lesson-item">
      <div class="lesson-order-btns">
        <button ${i === 0 ? "disabled" : ""} onclick="moveLesson(${i},-1)" title="เลื่อนขึ้น"><i data-lucide="chevron-up" style="width:15px;height:15px"></i></button>
        <button ${i === lessons.length - 1 ? "disabled" : ""} onclick="moveLesson(${i},1)" title="เลื่อนลง"><i data-lucide="chevron-down" style="width:15px;height:15px"></i></button>
      </div>
      <div class="lesson-num">${i + 1}</div>
      <div class="lesson-icon ${l.type}"><i data-lucide="${icon}" style="width:16px;height:16px"></i></div>
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
  const titles = { text: "เพิ่มเนื้อหาข้อความ", document: "เพิ่มเอกสารแนบ", quiz: "เพิ่มแบบทดสอบ" };
  document.getElementById("lessonModalTitle").textContent = titles[type] || "เพิ่มเนื้อหา";
  document.getElementById("lessonTitle").value = "";
  document.getElementById("lessonEditor").innerHTML = "";
  document.getElementById("lessonTextBlock").style.display = type === "text" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = type === "document" ? "block" : "none";
  document.getElementById("lessonQuizBlock").style.display = type === "quiz" ? "block" : "none";
  resetDocUI();
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
  lessonType = l.type;
  pendingDriveFile = l.type === "document"
    ? { id: l.fileId, name: l.fileName, webViewLink: l.fileUrl, mimeType: l.fileMimeType, iconLink: l.fileIconLink }
    : null;

  const titles = { text: "แก้ไขเนื้อหาข้อความ", document: "แก้ไขเอกสารแนบ", quiz: "แก้ไขแบบทดสอบ" };
  document.getElementById("lessonModalTitle").textContent = titles[l.type] || "แก้ไขเนื้อหา";
  document.getElementById("lessonTitle").value = l.title || "";
  document.getElementById("lessonEditor").innerHTML = l.content || "";
  document.getElementById("lessonTextBlock").style.display = l.type === "text" ? "block" : "none";
  document.getElementById("lessonDocBlock").style.display = l.type === "document" ? "block" : "none";
  document.getElementById("lessonQuizBlock").style.display = l.type === "quiz" ? "block" : "none";
  resetDocUI();
  if (l.type === "document" && l.fileName) showDocFileCard(pendingDriveFile);
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

  if (lessonType === "text") {
    const html = document.getElementById("lessonEditor").innerHTML.trim();
    if (!html) { showToast("กรุณากรอกเนื้อหาข้อความ", "error"); return; }
    data.content = html;
  } else if (lessonType === "document") {
    if (!pendingDriveFile) { showToast("กรุณาอัปโหลดไฟล์เอกสารก่อนบันทึก", "error"); return; }
    data.fileId = pendingDriveFile.id;
    data.fileName = pendingDriveFile.name;
    data.fileUrl = pendingDriveFile.webViewLink;
    data.fileMimeType = pendingDriveFile.mimeType || "";
    data.fileIconLink = pendingDriveFile.iconLink || "";
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

  uploadFileToDrive(file, editCourseId, pct => {
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
  const isImage = (f.mimeType || "").startsWith("image/");
  // หมายเหตุ: webViewLink เป็นหน้า viewer ของ Drive ไม่ใช่ URL รูปภาพโดยตรง จึงโชว์เป็นไอคอนแทน
  // ไม่ใช่ภาพตัวอย่างจริง — ถ้าต้องการ preview จริงต้องเปิดลิงก์ดูที่ Drive
  box.innerHTML = `
    <i data-lucide="${isImage ? "image" : "file-text"}" style="width:20px;height:20px;color:${isImage ? "var(--c-sky-deep)" : "var(--accent)"}"></i>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name || "")}</div>
      <div class="hint">${isImage ? "รูปภาพ" : "ไฟล์เอกสาร"} — อัปโหลดขึ้น Google Drive แล้ว${f.webViewLink ? ` · <a href="${f.webViewLink}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:700;">ดูตัวอย่าง</a>` : ""}</div>
    </div>
    <button type="button" class="icon-btn" onclick="document.getElementById('lessonFileInput').click()" title="เปลี่ยนไฟล์"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>`;
  lucide.createIcons();
}
