/* ══════════════════════════════════════════════════════════
   NP-LearnLab · admin.js
   สำคัญ: เฉลยข้อสอบ (correct) เก็บแยกใน subcollection 'answerKeys'
   ซึ่ง Firestore rules อนุญาตให้อ่านได้เฉพาะแอดมินที่มีสิทธิ์ training เท่านั้น
   (ดู firestore.rules) — หน้าเว็บผู้เรียนจะไม่มีทางอ่านคอลเลกชันนี้ได้เลย
   ══════════════════════════════════════════════════════════ */

var currentUser = null;
var courses = [];
var editCourseId = null;
var activeTab = 'general';
var editLessonId = null;
var editQuestionId = null;

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
}); }

function doSignIn() {
  document.getElementById('signinError').style.display = 'none';
  signInWithSchoolGoogle().catch(function(err) {
    var el = document.getElementById('signinError');
    el.textContent = err.message || 'ล็อกอินไม่สำเร็จ'; el.style.display = 'block';
  });
}

auth.onAuthStateChanged(function(user) {
  if (!user) {
    document.getElementById('signinScreen').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('deniedScreen').style.display = 'none';
    return;
  }
  currentUser = user;
  db.collection('admins').doc(user.email).get().then(function(doc) {
    var allowed = doc.exists && doc.data().permissions && doc.data().permissions.training === true;
    if (!allowed) {
      document.getElementById('signinScreen').style.display = 'none';
      document.getElementById('deniedScreen').style.display = 'flex';
      return;
    }
    document.getElementById('signinScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    document.getElementById('userLabel').textContent = user.email;
    loadData();
  });
});

function loadData() {
  db.collection('training_courses').orderBy('createdAt', 'desc').get().then(function(snap) {
    courses = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderView();
  });
}

function renderView() {
  document.getElementById('body').innerHTML = renderTable();
  lucide.createIcons();
}

function renderTable() {
  if (!courses.length) return '<div class="panel empty">ยังไม่มีหลักสูตร กด "สร้างหลักสูตรใหม่" เพื่อเริ่มต้น</div>';
  var statusTag = { draft: '<span class="tag tag-wait">ฉบับร่าง</span>', published: '<span class="tag tag-pass">เผยแพร่แล้ว</span>', closed: '<span class="tag tag-fail">ปิดรับสมัคร</span>' };
  var rows = courses.map(function(c) {
    return '<tr><td><b>' + esc(c.title) + '</b><br><span style="font-size:12px;color:var(--ink-soft);">' + (c.lessonCount||0) + ' บทเรียน · ' + (c.questionCount||0) + ' ข้อสอบในคลัง</span></td>' +
      '<td>' + (statusTag[c.status] || '') + '</td>' +
      '<td>' + (c.enrolledCount || 0) + ' คน</td><td>' + (c.passedCount || 0) + ' คน</td>' +
      '<td style="text-align:right;"><button class="btn btn-outline" onclick="openCourseModal(\'' + c.id + '\')"><i data-lucide="settings" style="width:14px;height:14px;"></i> จัดการ</button></td></tr>';
  }).join('');
  return '<div class="panel" style="padding:0;overflow-x:auto;"><table><thead><tr><th>หลักสูตร</th><th>สถานะ</th><th>ลงทะเบียน</th><th>ผ่านเกณฑ์</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* ══════════════════ Modal หลักสูตร (แท็บ) ══════════════════ */
function openCourseModal(courseId) {
  editCourseId = courseId; activeTab = 'general';
  var render = function() { renderCourseModal(); document.getElementById('courseModal').classList.add('open'); };
  if (!courseId) {
    var data = { title: '', desc: '', status: 'draft', passScore: 70, examQuestionCount: 5, seatLimit: null, closeDate: null, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.email, lessonCount: 0, questionCount: 0, enrolledCount: 0, passedCount: 0 };
    db.collection('training_courses').add(data).then(function(ref) {
      editCourseId = ref.id;
      courses.unshift(Object.assign({ id: ref.id }, data));
      loadCourseChildren(ref.id, render);
    });
  } else {
    loadCourseChildren(courseId, render);
  }
}

function loadCourseChildren(courseId, done) {
  var c = findCourse(courseId);
  Promise.all([
    db.collection('training_courses').doc(courseId).collection('lessons').orderBy('order').get(),
    db.collection('training_courses').doc(courseId).collection('questions').orderBy('order').get(),
    db.collection('training_enrollments').where('courseId', '==', courseId).get()
  ]).then(function(r) {
    c.lessons = r[0].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    c.questions = r[1].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    c.learners = r[2].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    done();
  });
}

function closeCourseModal() { document.getElementById('courseModal').classList.remove('open'); renderView(); }
function findCourse(id) { return courses.filter(function(c) { return c.id === id; })[0]; }
function switchTab(t) { activeTab = t; renderCourseModal(); }

function renderCourseModal() {
  var c = findCourse(editCourseId);
  var tabs = [['general','ข้อมูลทั่วไป','info'],['lessons','เนื้อหา/วิดีโอ','file-text'],['exam','คลังข้อสอบ','list-checks'],['learners','ผู้เรียน/ผลสอบ','users']];
  var bar = tabs.map(function(t) { return '<button class="' + (activeTab===t[0]?'active':'') + '" onclick="switchTab(\'' + t[0] + '\')"><i data-lucide="' + t[2] + '" style="width:13px;height:13px;"></i> ' + t[1] + '</button>'; }).join('');
  var pane = activeTab==='general' ? paneGeneral(c) : activeTab==='lessons' ? paneLessons(c) : activeTab==='exam' ? paneExam(c) : paneLearners(c);
  document.getElementById('courseModalBody').innerHTML =
    '<div class="modal-head"><div><h3>' + (c.title || 'หลักสูตรใหม่') + '</h3><p>สร้างหัวข้อ เพิ่มเนื้อหา ข้อสอบ และติดตามผู้เรียน</p></div><button class="modal-close" onclick="closeCourseModal()">&times;</button></div>' +
    '<div class="tabbar">' + bar + '</div><div>' + pane + '</div>';
  lucide.createIcons();
}

/* ── ข้อมูลทั่วไป ── */
function paneGeneral(c) {
  return '<div class="field"><label>ชื่อหลักสูตร</label><input id="gTitle" value="' + esc(c.title) + '"></div>' +
    '<div class="field"><label>คำอธิบาย</label><textarea id="gDesc" rows="3">' + esc(c.desc) + '</textarea></div>' +
    '<div class="field-row">' +
      '<div class="field"><label>เกณฑ์ผ่าน (%)</label><input id="gPass" type="number" min="0" max="100" value="' + c.passScore + '"></div>' +
      '<div class="field"><label>จำนวนข้อสอบที่สุ่มออก</label><input id="gQCount" type="number" min="1" value="' + c.examQuestionCount + '"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label>จำนวนที่นั่ง (เว้นว่าง = ไม่จำกัด)</label><input id="gSeat" type="number" min="1" value="' + (c.seatLimit || '') + '"></div>' +
      '<div class="field"><label>ปิดรับสมัครวันที่ (เว้นว่าง = ไม่กำหนด)</label><input id="gClose" type="date" value="' + (c.closeDate || '') + '"></div>' +
    '</div>' +
    '<div class="field"><label>สถานะ</label><select id="gStatus">' +
      '<option value="draft"' + (c.status==='draft'?' selected':'') + '>ฉบับร่าง</option>' +
      '<option value="published"' + (c.status==='published'?' selected':'') + '>เผยแพร่ (เปิดให้ลงทะเบียน)</option>' +
      '<option value="closed"' + (c.status==='closed'?' selected':'') + '>ปิดรับสมัคร</option>' +
    '</select></div>' +
    '<button class="btn btn-brass" onclick="saveGeneral()"><i data-lucide="save" style="width:15px;height:15px;"></i> บันทึก</button>';
}

function saveGeneral() {
  var title = document.getElementById('gTitle').value.trim();
  if (!title) { alert('กรุณาระบุชื่อหลักสูตร'); return; }
  var data = {
    title: title, desc: document.getElementById('gDesc').value,
    passScore: parseInt(document.getElementById('gPass').value || 70),
    examQuestionCount: parseInt(document.getElementById('gQCount').value || 5),
    seatLimit: document.getElementById('gSeat').value ? parseInt(document.getElementById('gSeat').value) : null,
    closeDate: document.getElementById('gClose').value || null,
    status: document.getElementById('gStatus').value
  };
  db.collection('training_courses').doc(editCourseId).set(data, { merge: true }).then(function() {
    Object.assign(findCourse(editCourseId), data);
    alert('บันทึกแล้ว'); renderCourseModal(); loadData();
  });
}

/* ── เนื้อหา/วิดีโอ ── */
function paneLessons(c) {
  var rows = c.lessons.length ? c.lessons.map(function(l, i) {
    return '<div class="panel" style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">' +
      '<div style="display:flex;align-items:center;gap:9px;"><i data-lucide="' + (l.type==='video'?'play-circle':'file-text') + '" style="width:16px;height:16px;color:var(--ink-soft);"></i>' +
      '<div><b style="font-size:13px;">' + (i+1) + '. ' + esc(l.title) + '</b></div></div>' +
      '<div style="display:flex;gap:5px;">' +
        (i>0 ? '<button class="btn btn-outline" onclick="moveLesson(\''+l.id+'\',-1)"><i data-lucide="arrow-up" style="width:13px;height:13px;"></i></button>' : '') +
        (i<c.lessons.length-1 ? '<button class="btn btn-outline" onclick="moveLesson(\''+l.id+'\',1)"><i data-lucide="arrow-down" style="width:13px;height:13px;"></i></button>' : '') +
        '<button class="btn btn-outline" onclick="openLessonModal(\''+l.id+'\')"><i data-lucide="edit" style="width:13px;height:13px;"></i></button>' +
        '<button class="btn btn-outline" onclick="deleteLesson(\''+l.id+'\')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>' +
      '</div></div>';
  }).join('') : '<div class="empty">ยังไม่มีบทเรียน</div>';
  return rows + '<button class="btn btn-brass" style="margin-top:6px;" onclick="openLessonModal(null)"><i data-lucide="plus" style="width:15px;height:15px;"></i> เพิ่มบทเรียน/วิดีโอ</button>';
}

function openLessonModal(lessonId) {
  editLessonId = lessonId;
  var c = findCourse(editCourseId);
  var l = lessonId ? c.lessons.filter(function(x){return x.id===lessonId;})[0] : { title:'', type:'text', body:'', videoUrl:'' };
  document.getElementById('lessonModalBody').innerHTML =
    '<div class="modal-head"><h3>' + (lessonId?'แก้ไขบทเรียน':'เพิ่มบทเรียนใหม่') + '</h3><button class="modal-close" onclick="closeLessonModal()">&times;</button></div>' +
    '<div class="field"><label>ชื่อบทเรียน</label><input id="lTitle" value="' + esc(l.title) + '"></div>' +
    '<div class="field"><label>รูปแบบ</label><select id="lType" onchange="toggleLType(this.value)">' +
      '<option value="text"' + (l.type==='text'?' selected':'') + '>บทความ/เอกสาร</option>' +
      '<option value="video"' + (l.type==='video'?' selected':'') + '>วิดีโอ (YouTube unlisted)</option></select></div>' +
    '<div class="field" id="lBodyWrap" style="display:' + (l.type==='video'?'none':'block') + ';"><label>เนื้อหา</label><textarea id="lBody" rows="5">' + esc(l.body||'') + '</textarea></div>' +
    '<div class="field" id="lVideoWrap" style="display:' + (l.type==='video'?'block':'none') + ';"><label>ลิงก์วิดีโอ YouTube (ตั้งเป็น "ไม่แสดงต่อสาธารณะ / Unlisted")</label><input id="lVideoUrl" value="' + esc(l.videoUrl||'') + '" placeholder="https://youtu.be/..."></div>' +
    '<button class="btn btn-brass" onclick="saveLesson()"><i data-lucide="save" style="width:15px;height:15px;"></i> บันทึก</button>';
  document.getElementById('lessonModal').classList.add('open'); lucide.createIcons();
}
function toggleLType(t) { document.getElementById('lBodyWrap').style.display = t==='video'?'none':'block'; document.getElementById('lVideoWrap').style.display = t==='video'?'block':'none'; }
function closeLessonModal() { document.getElementById('lessonModal').classList.remove('open'); }

function saveLesson() {
  var title = document.getElementById('lTitle').value.trim();
  if (!title) { alert('กรุณาระบุชื่อบทเรียน'); return; }
  var c = findCourse(editCourseId);
  var data = { title: title, type: document.getElementById('lType').value, body: document.getElementById('lBody').value, videoUrl: document.getElementById('lVideoUrl').value };
  var ref = db.collection('training_courses').doc(editCourseId).collection('lessons');
  var promise;
  if (editLessonId) {
    promise = ref.doc(editLessonId).set(data, { merge: true }).then(function() { Object.assign(c.lessons.filter(function(x){return x.id===editLessonId;})[0], data); });
  } else {
    data.order = c.lessons.length;
    promise = ref.add(data).then(function(r) { c.lessons.push(Object.assign({ id: r.id }, data)); });
  }
  promise.then(function() {
    db.collection('training_courses').doc(editCourseId).update({ lessonCount: c.lessons.length });
    closeLessonModal(); renderCourseModal();
  });
}

function deleteLesson(lessonId) {
  var c = findCourse(editCourseId);
  db.collection('training_courses').doc(editCourseId).collection('lessons').doc(lessonId).delete().then(function() {
    c.lessons = c.lessons.filter(function(l) { return l.id !== lessonId; });
    db.collection('training_courses').doc(editCourseId).update({ lessonCount: c.lessons.length });
    renderCourseModal();
  });
}

function moveLesson(lessonId, dir) {
  var c = findCourse(editCourseId);
  var idx = c.lessons.findIndex(function(l) { return l.id === lessonId; });
  var swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= c.lessons.length) return;
  var a = c.lessons[idx], b = c.lessons[swapIdx];
  c.lessons[idx] = b; c.lessons[swapIdx] = a;
  var batch = db.batch();
  var ref = db.collection('training_courses').doc(editCourseId).collection('lessons');
  batch.update(ref.doc(a.id), { order: swapIdx });
  batch.update(ref.doc(b.id), { order: idx });
  batch.commit().then(renderCourseModal);
}

/* ── คลังข้อสอบ (เฉลยเก็บแยกใน answerKeys) ── */
function paneExam(c) {
  var rows = c.questions.length ? c.questions.map(function(q, i) {
    return '<div class="panel" style="padding:10px 12px;margin-bottom:7px;"><div style="display:flex;justify-content:space-between;">' +
      '<b style="font-size:13px;">' + (i+1) + '. ' + esc(q.text) + '</b>' +
      '<div style="display:flex;gap:5px;flex-shrink:0;"><button class="btn btn-outline" onclick="openQuestionModal(\''+q.id+'\')"><i data-lucide="edit" style="width:13px;height:13px;"></i></button>' +
      '<button class="btn btn-outline" onclick="deleteQuestion(\''+q.id+'\')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button></div></div></div>';
  }).join('') : '<div class="empty">ยังไม่มีข้อสอบในคลัง</div>';
  return '<p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px;">ระบบจะสุ่ม ' + c.examQuestionCount + ' ข้อจากคลังนี้ให้ผู้เรียนแต่ละคน (ตั้งค่าจำนวนได้ในแท็บ "ข้อมูลทั่วไป")</p>' +
    rows + '<button class="btn btn-brass" style="margin-top:6px;" onclick="openQuestionModal(null)"><i data-lucide="plus" style="width:15px;height:15px;"></i> เพิ่มข้อสอบ</button>';
}

function openQuestionModal(qId) {
  editQuestionId = qId;
  var c = findCourse(editCourseId);
  var render = function(q) {
    var choiceInputs = q.choices.map(function(ch, i) {
      return '<label style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><input type="radio" name="qCorrect" value="' + i + '"' + (q.correct===i?' checked':'') + '><input type="text" class="qChoice" value="' + esc(ch) + '" placeholder="ตัวเลือกที่ ' + (i+1) + '" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:4px;"></label>';
    }).join('');
    document.getElementById('questionModalBody').innerHTML =
      '<div class="modal-head"><div><h3>' + (qId?'แก้ไขข้อสอบ':'เพิ่มข้อสอบใหม่') + '</h3><p>เลือกวงกลมหน้าตัวเลือกที่เป็นคำตอบถูก</p></div><button class="modal-close" onclick="closeQuestionModal()">&times;</button></div>' +
      '<div class="field"><label>คำถาม</label><input id="qText" value="' + esc(q.text) + '"></div>' +
      '<div class="field"><label>ตัวเลือก</label>' + choiceInputs + '</div>' +
      '<button class="btn btn-brass" onclick="saveQuestion()"><i data-lucide="save" style="width:15px;height:15px;"></i> บันทึก</button>';
    document.getElementById('questionModal').classList.add('open'); lucide.createIcons();
  };
  if (qId) {
    // ต้องดึงเฉลยจริงจาก answerKeys มาแสดงตอนแก้ไข (แอดมินมีสิทธิ์อ่านตาม firestore.rules)
    Promise.all([
      Promise.resolve(c.questions.filter(function(x){return x.id===qId;})[0]),
      db.collection('training_courses').doc(editCourseId).collection('answerKeys').doc(qId).get()
    ]).then(function(r) { render(Object.assign({}, r[0], { correct: r[1].data().correct })); });
  } else {
    render({ text: '', choices: ['', '', '', ''], correct: 0 });
  }
}
function closeQuestionModal() { document.getElementById('questionModal').classList.remove('open'); }

function saveQuestion() {
  var text = document.getElementById('qText').value.trim();
  var choices = Array.prototype.map.call(document.querySelectorAll('.qChoice'), function(el) { return el.value.trim(); });
  var correctEl = document.querySelector('input[name="qCorrect"]:checked');
  if (!text || choices.some(function(c){return !c;}) || !correctEl) { alert('กรุณากรอกคำถาม ตัวเลือกให้ครบ และเลือกเฉลย'); return; }
  var c = findCourse(editCourseId);
  var correct = parseInt(correctEl.value);
  var qData = { text: text, choices: choices, order: editQuestionId ? undefined : c.questions.length };
  var qRef = db.collection('training_courses').doc(editCourseId).collection('questions');
  var kRef = db.collection('training_courses').doc(editCourseId).collection('answerKeys');
  var promise;
  if (editQuestionId) {
    promise = Promise.all([ qRef.doc(editQuestionId).set({ text: text, choices: choices }, { merge: true }), kRef.doc(editQuestionId).set({ correct: correct }, { merge: true }) ])
      .then(function() { Object.assign(c.questions.filter(function(x){return x.id===editQuestionId;})[0], { text: text, choices: choices }); });
  } else {
    promise = qRef.add({ text: text, choices: choices, order: c.questions.length }).then(function(r) {
      return kRef.doc(r.id).set({ correct: correct }).then(function() { c.questions.push({ id: r.id, text: text, choices: choices }); });
    });
  }
  promise.then(function() {
    db.collection('training_courses').doc(editCourseId).update({ questionCount: c.questions.length });
    closeQuestionModal(); renderCourseModal();
  });
}

function deleteQuestion(qId) {
  var c = findCourse(editCourseId);
  Promise.all([
    db.collection('training_courses').doc(editCourseId).collection('questions').doc(qId).delete(),
    db.collection('training_courses').doc(editCourseId).collection('answerKeys').doc(qId).delete()
  ]).then(function() {
    c.questions = c.questions.filter(function(q) { return q.id !== qId; });
    db.collection('training_courses').doc(editCourseId).update({ questionCount: c.questions.length });
    renderCourseModal();
  });
}

/* ── ผู้เรียน/ผลสอบ ── */
function paneLearners(c) {
  if (!c.learners.length) return '<div class="empty">ยังไม่มีผู้ลงทะเบียนเรียน</div>';
  var rows = c.learners.map(function(l) {
    var tag = l.status==='passed' ? '<span class="tag tag-pass">ผ่านแล้ว</span>' : l.status==='failed' ? '<span class="tag tag-fail">ไม่ผ่าน</span>' : '<span class="tag tag-progress">กำลังเรียน</span>';
    return '<tr><td>' + esc(l.userName) + '<br><span style="font-size:11px;color:var(--ink-soft);">' + esc(l.userEmail) + '</span></td><td>' + tag + '</td>' +
      '<td>' + (l.examScore==null?'-':l.examScore+'%') + '</td>' +
      '<td style="text-align:right;">' + (l.status==='passed' ? '<button class="btn btn-outline" onclick="viewCertificate(\''+l.userEmail+'\')"><i data-lucide="printer" style="width:13px;height:13px;"></i> เปิดเกียรติบัตร</button>' : '') + '</td></tr>';
  }).join('');
  return '<table><thead><tr><th>ผู้เรียน</th><th>สถานะ</th><th>คะแนน</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function viewCertificate(userEmail) {
  db.collection('training_certificates').where('courseId', '==', editCourseId).where('userEmail', '==', userEmail).limit(1).get().then(function(snap) {
    if (snap.empty) { alert('ยังไม่พบเกียรติบัตร (อาจกำลังสร้างอยู่)'); return; }
    window.open(snap.docs[0].data().pdfUrl, '_blank');
  });
}
