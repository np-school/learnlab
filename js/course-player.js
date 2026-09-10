// =========================================================
// NP-LearnLab — หน้าเรียน (course-player.html)
// ผู้เรียนที่สมัครหลักสูตรแล้วเข้ามาดูเนื้อหา/ทำแบบทดสอบ/ติดตามความคืบหน้าที่นี่
// =========================================================

let playerUser = null;
let playerCourseId = null;
let playerEnrollId = null;
let playerCourse = null;
let playerLessons = [];
let playerEnrollment = null;
let activeLessonId = null;

// state ชั่วคราวของแบบทดสอบที่กำลังทำอยู่ (ยังไม่ส่ง)
let quizPicked = {};    // { questionIndex: optionIndex }
let quizSubmitted = false;

guardPage(["user"], (user, profile) => {
  renderShell("user", "my-courses.html", profile);
  playerUser = user;

  const params = new URLSearchParams(window.location.search);
  playerCourseId = params.get("id");
  if (!playerCourseId) {
    showToast("ไม่พบหลักสูตรที่ต้องการ", "error");
    window.location.href = "my-courses.html";
    return;
  }
  playerEnrollId = user.uid + "_" + playerCourseId;
  loadEverything();
});

function loadEverything() {
  Promise.all([
    db.collection("enrollments").doc(playerEnrollId).get(),
    db.collection("courses").doc(playerCourseId).get(),
    db.collection("courses").doc(playerCourseId).collection("lessons").orderBy("order", "asc").get()
  ]).then(([enrollSnap, courseSnap, lessonSnap]) => {
    if (!enrollSnap.exists) {
      showToast("คุณยังไม่ได้สมัครเรียนหลักสูตรนี้", "error");
      window.location.href = "courses.html";
      return;
    }
    if (!courseSnap.exists) {
      showToast("ไม่พบหลักสูตรนี้ อาจถูกลบไปแล้ว", "error");
      window.location.href = "my-courses.html";
      return;
    }
    playerEnrollment = { id: enrollSnap.id, ...enrollSnap.data() };
    playerCourse = { id: courseSnap.id, ...courseSnap.data() };
    playerLessons = lessonSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!Array.isArray(playerEnrollment.completedLessonIds)) playerEnrollment.completedLessonIds = [];

    renderHeader();
    renderLessonNav();
    document.getElementById("playerLoading").style.display = "none";

    if (playerLessons.length) {
      document.getElementById("playerLayout").style.display = "flex";
      selectLesson(playerLessons[0].id);
    } else {
      document.getElementById("lessonContent").innerHTML = `<div class="empty-state">
        <i data-lucide="layers" style="width:30px;height:30px;color:var(--text3)"></i>
        <div style="margin-top:8px;">หลักสูตรนี้ยังไม่มีเนื้อหา กรุณาตรวจสอบใหม่ภายหลัง</div></div>`;
      document.getElementById("playerLayout").style.display = "flex";
      lucide.createIcons();
    }
  }).catch(err => {
    console.error(err);
    showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, "error");
    document.getElementById("playerLoading").innerHTML = `<div>เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
  });
}

function renderHeader() {
  document.getElementById("courseTitleEl").textContent = playerCourse.title || "หลักสูตร";
  document.getElementById("courseSubEl").textContent = playerCourse.description || "";

  const bannerEl = document.getElementById("playerBanner");
  if (playerCourse.coverUrl) {
    bannerEl.style.display = "flex";
    bannerEl.innerHTML = `<img src="${playerCourse.coverUrl}" alt="" onerror="this.parentElement.style.display='none';">`;
  } else {
    bannerEl.style.display = "none";
  }

  document.getElementById("progressRow").style.display = "block";
  updateProgressUI();
}

function updateProgressUI() {
  const total = playerLessons.length;
  const done = playerEnrollment.completedLessonIds.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressPct").textContent = pct + "%";
  document.getElementById("progressFill").style.width = pct + "%";
  const badge = document.getElementById("progressBadge");
  const isDone = playerEnrollment.status === "completed";
  badge.className = "badge " + (isDone ? "green" : "sky");
  badge.textContent = isDone ? "เรียนจบแล้ว" : "กำลังเรียน";
}

// การเรียนต้องเรียงตามลำดับ — บทที่ i ปลดล็อกได้ก็ต่อเมื่อบทที่ i-1 "เรียนแล้ว/ผ่านแล้ว" เท่านั้น
// (บทแรกปลดล็อกเสมอ)
function isLessonUnlocked(index) {
  if (index <= 0) return true;
  const prev = playerLessons[index - 1];
  return playerEnrollment.completedLessonIds.includes(prev.id);
}

function lockedLessonClick() {
  showToast("กรุณาเรียนเนื้อหาก่อนหน้าให้เสร็จก่อน จึงจะปลดล็อกบทถัดไปได้", "error");
}

function renderLessonNav() {
  const box = document.getElementById("lessonNav");
  box.innerHTML = playerLessons.map((l, i) => {
    const isDone = playerEnrollment.completedLessonIds.includes(l.id);
    const unlocked = isLessonUnlocked(i);
    const isActive = l.id === activeLessonId;
    const icon = l.type === "text" ? "align-left" : l.type === "quiz" ? "help-circle" : l.type === "video" ? "video" : "file-text";
    const statusInner = isDone
      ? '<i data-lucide="check" style="width:14px;height:14px"></i>'
      : (!unlocked ? '<i data-lucide="lock" style="width:12px;height:12px"></i>' : (i + 1));
    const typeLabel = l.type === "text" ? "เนื้อหา" : l.type === "quiz" ? "แบบทดสอบ" : l.type === "video" ? "วิดีโอ" : "เอกสารแนบ";
    return `
    <button class="player-lesson-btn ${isActive ? "active" : ""} ${!unlocked ? "locked" : ""}"
      onclick="${unlocked ? `selectLesson('${l.id}')` : "lockedLessonClick()"}" ${!unlocked ? 'title="เรียนบทก่อนหน้าให้เสร็จก่อน"' : ""}>
      <div class="player-lesson-status ${isDone ? "done" : ""} ${!unlocked ? "locked" : ""}">${statusInner}</div>
      <div class="player-lesson-btn-body">
        <div class="player-lesson-btn-title">${escapePlayerHtml(l.title || "(ไม่มีชื่อ)")}</div>
        <div class="player-lesson-btn-meta">${typeLabel}</div>
      </div>
      <i data-lucide="${!unlocked ? "lock" : icon}" style="width:14px;height:14px;flex-shrink:0;color:var(--text3)"></i>
    </button>`;
  }).join("");
  lucide.createIcons();
}

function escapePlayerHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function selectLesson(lessonId) {
  const idx = playerLessons.findIndex(x => x.id === lessonId);
  if (idx > 0 && !isLessonUnlocked(idx)) { lockedLessonClick(); return; }

  activeLessonId = lessonId;
  quizPicked = {};
  quizSubmitted = false;
  renderLessonNav();
  const l = playerLessons.find(x => x.id === lessonId);
  const contentEl = document.getElementById("lessonContent");
  if (!l) { contentEl.innerHTML = ""; return; }

  const isDone = playerEnrollment.completedLessonIds.includes(l.id);

  if (l.type === "text") {
    contentEl.innerHTML = `
      <h2 style="margin-top:0;">${escapePlayerHtml(l.title || "")}</h2>
      <div style="font-size:14px;line-height:1.8;">${l.content || "<p>ยังไม่มีเนื้อหา</p>"}</div>
      <div style="margin-top:22px;border-top:1px solid var(--border-soft);padding-top:16px;">
        ${isDone
          ? `<span class="badge green"><i data-lucide="check" style="width:12px;height:12px"></i>เรียนแล้ว</span>`
          : `<button class="btn-primary" onclick="markLessonComplete('${l.id}')"><i data-lucide="check" style="width:14px;height:14px"></i>ทำเครื่องหมายว่าเรียนแล้ว</button>`}
        ${renderNextLessonBtn(l.id)}
      </div>`;
  } else if (l.type === "document") {
    const isImage = (l.fileMimeType || "").startsWith("image/");
    contentEl.innerHTML = `
      <h2 style="margin-top:0;">${escapePlayerHtml(l.title || "")}</h2>
      <div class="player-doc-card">
        <i data-lucide="${isImage ? "image" : "file-text"}" style="width:26px;height:26px;color:${isImage ? "var(--c-sky-deep)" : "var(--accent)"}"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;">${escapePlayerHtml(l.fileName || (isImage ? "รูปภาพ" : "ไฟล์เอกสาร"))}</div>
          <div class="hint">${isImage ? "รูปภาพ" : "ไฟล์เอกสาร"} — จัดเก็บบน Google Drive</div>
        </div>
        ${l.fileUrl ? `<a class="btn-secondary" href="${l.fileUrl}" target="_blank" rel="noopener"><i data-lucide="external-link" style="width:14px;height:14px"></i>เปิดไฟล์</a>` : ""}
      </div>
      <div style="margin-top:22px;border-top:1px solid var(--border-soft);padding-top:16px;">
        ${isDone
          ? `<span class="badge green"><i data-lucide="check" style="width:12px;height:12px"></i>เรียนแล้ว</span>`
          : `<button class="btn-primary" onclick="markLessonComplete('${l.id}')"><i data-lucide="check" style="width:14px;height:14px"></i>ทำเครื่องหมายว่าเรียนแล้ว</button>`}
        ${renderNextLessonBtn(l.id)}
      </div>`;
  } else if (l.type === "video") {
    contentEl.innerHTML = `
      <h2 style="margin-top:0;">${escapePlayerHtml(l.title || "")}</h2>
      ${l.videoUrl
        ? `<div class="player-video-wrap"><iframe src="${l.videoUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`
        : `<div class="empty-state">ยังไม่มีวิดีโอ</div>`}
      <div style="margin-top:22px;border-top:1px solid var(--border-soft);padding-top:16px;">
        ${isDone
          ? `<span class="badge green"><i data-lucide="check" style="width:12px;height:12px"></i>เรียนแล้ว</span>`
          : `<button class="btn-primary" onclick="markLessonComplete('${l.id}')"><i data-lucide="check" style="width:14px;height:14px"></i>ทำเครื่องหมายว่าเรียนแล้ว</button>`}
        ${renderNextLessonBtn(l.id)}
      </div>`;
  } else if (l.type === "quiz") {
    renderQuiz(l, isDone);
  }
  lucide.createIcons();
}

function renderNextLessonBtn(currentId) {
  const idx = playerLessons.findIndex(x => x.id === currentId);
  const next = playerLessons[idx + 1];
  if (!next) return "";
  // บทถัดไปจะปลดล็อกได้ก็ต่อเมื่อบทปัจจุบันเรียน/ผ่านแล้วเท่านั้น จึงค่อยแสดงปุ่มนี้
  if (!playerEnrollment.completedLessonIds.includes(currentId)) return "";
  return `<button class="btn-secondary" style="margin-right:8px;" onclick="selectLesson('${next.id}')">บทถัดไป<i data-lucide="chevron-left" style="width:14px;height:14px"></i></button>`;
}

// ---------------------------------------------------------
// แบบทดสอบ — ทำได้ไม่จำกัดจำนวนครั้ง ผ่านเกณฑ์ passScore จึงจะนับว่าเรียนจบบทนี้
// ---------------------------------------------------------
function renderQuiz(l, isDone) {
  const contentEl = document.getElementById("lessonContent");
  const questions = l.questions || [];
  const passScore = l.passScore != null ? l.passScore : 70;

  const qHtml = questions.map((q, qi) => `
    <div class="player-quiz-q">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:4px;">ข้อที่ ${qi + 1}. ${escapePlayerHtml(q.text || "")}</div>
      ${(q.options || []).map((opt, oi) => {
        let cls = "";
        if (quizSubmitted) {
          if (oi === q.correct) cls = "correct";
          else if (quizPicked[qi] === oi) cls = "wrong";
        } else if (quizPicked[qi] === oi) cls = "picked";
        return `
        <label class="player-quiz-opt ${cls}">
          <input type="radio" name="q${qi}" ${quizPicked[qi] === oi ? "checked" : ""} ${quizSubmitted ? "disabled" : ""} onchange="pickQuizOption(${qi},${oi})">
          <span>${escapePlayerHtml(opt)}</span>
        </label>`;
      }).join("")}
    </div>`).join("");

  let resultHtml = "";
  if (quizSubmitted) {
    const { correctCount, total, pct, passed } = gradeQuiz(l);
    resultHtml = `
      <div class="player-quiz-result ${passed ? "pass" : "fail"}">
        ${passed ? "ยินดีด้วย ผ่านแบบทดสอบ!" : "ยังไม่ผ่านเกณฑ์"} — ตอบถูก ${correctCount}/${total} ข้อ (${pct}%) · เกณฑ์ผ่าน ${passScore}%
      </div>`;
  }

  contentEl.innerHTML = `
    <h2 style="margin-top:0;">${escapePlayerHtml(l.title || "")}</h2>
    <div class="hint" style="margin-bottom:14px;">เกณฑ์ผ่าน ${passScore}% — ทำซ้ำได้ไม่จำกัดจำนวนครั้ง</div>
    ${!questions.length ? `<div class="empty-state">ยังไม่มีคำถามในแบบทดสอบนี้</div>` : qHtml}
    ${resultHtml}
    <div style="margin-top:18px;border-top:1px solid var(--border-soft);padding-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      ${isDone ? `<span class="badge green"><i data-lucide="check" style="width:12px;height:12px"></i>ผ่านแล้ว</span>` : ""}
      ${questions.length ? (
        !quizSubmitted
          ? `<button class="btn-primary" onclick="submitQuiz('${l.id}')"><i data-lucide="send" style="width:14px;height:14px"></i>ส่งคำตอบ</button>`
          : `<button class="btn-secondary" onclick="retakeQuiz('${l.id}')"><i data-lucide="rotate-ccw" style="width:14px;height:14px"></i>ทำใหม่</button>`
      ) : ""}
      ${renderNextLessonBtn(l.id)}
    </div>`;
  lucide.createIcons();
}

function pickQuizOption(qi, oi) {
  if (quizSubmitted) return;
  quizPicked[qi] = oi;
  const l = playerLessons.find(x => x.id === activeLessonId);
  renderQuiz(l, playerEnrollment.completedLessonIds.includes(l.id));
}

function gradeQuiz(l) {
  const questions = l.questions || [];
  let correctCount = 0;
  questions.forEach((q, qi) => { if (quizPicked[qi] === q.correct) correctCount++; });
  const total = questions.length;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  const passScore = l.passScore != null ? l.passScore : 70;
  return { correctCount, total, pct, passed: pct >= passScore };
}

function submitQuiz(lessonId) {
  const l = playerLessons.find(x => x.id === lessonId);
  const questions = l.questions || [];
  if (Object.keys(quizPicked).length < questions.length) {
    showToast("กรุณาตอบให้ครบทุกข้อก่อนส่งคำตอบ", "error");
    return;
  }
  quizSubmitted = true;
  const { passed } = gradeQuiz(l);
  renderQuiz(l, playerEnrollment.completedLessonIds.includes(l.id));
  if (passed) markLessonComplete(lessonId, true);
}

function retakeQuiz(lessonId) {
  quizPicked = {};
  quizSubmitted = false;
  const l = playerLessons.find(x => x.id === lessonId);
  renderQuiz(l, playerEnrollment.completedLessonIds.includes(l.id));
}

// ---------------------------------------------------------
// บันทึกความคืบหน้าเข้า enrollments/{uid_courseId}
// ---------------------------------------------------------
function markLessonComplete(lessonId, silent) {
  if (playerEnrollment.completedLessonIds.includes(lessonId)) return;
  playerEnrollment.completedLessonIds.push(lessonId);

  const total = playerLessons.length;
  const done = playerEnrollment.completedLessonIds.length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const nowCompleted = total > 0 && done >= total;

  const update = {
    completedLessonIds: playerEnrollment.completedLessonIds,
    progress,
    status: nowCompleted ? "completed" : "in_progress"
  };
  if (nowCompleted && playerEnrollment.status !== "completed") {
    update.completedAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  db.collection("enrollments").doc(playerEnrollId).set(update, { merge: true }).then(() => {
    playerEnrollment.status = update.status;
    updateProgressUI();
    renderLessonNav();
    if (!silent) showToast("บันทึกความคืบหน้าเรียบร้อย", "success");
    if (nowCompleted) showToast("ยินดีด้วย! คุณเรียนจบหลักสูตรนี้แล้ว", "success");
    const l = playerLessons.find(x => x.id === lessonId);
    if (l && l.type !== "quiz") selectLesson(lessonId); // รีเฟรชปุ่ม/ป้าย "เรียนแล้ว"
  }).catch(err => showToast("บันทึกความคืบหน้าไม่สำเร็จ: " + err.message, "error"));
}
