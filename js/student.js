/* ══════════════════════════════════════════════════════════
   NP-LearnLab · student.js
   หลักการสำคัญ: หน้านี้ "ไม่เคย" โหลดฟิลด์ correct ของข้อสอบมาที่ client
   การตรวจข้อสอบและคำนวณคะแนนทำที่ Cloud Function เท่านั้น (functions/index.js)
   ══════════════════════════════════════════════════════════ */

var currentUser = null;
var courses = [];      // training_courses ที่ status == 'published'
var enrollMap = {};    // courseId -> enrollment doc (+ id)
var myProfile = null;  // profiles/{email} — ข้อมูลที่จะใช้บนเกียรติบัตร
var view = 'home';     // 'home' | 'profile' | 'my-trainings' | 'catalog' | 'detail'
var returnView = 'catalog'; // จำหน้าที่มาก่อนเข้า detail เพื่อกดย้อนกลับถูกที่
var activeCourseId = null;
var activeLessonIdx = 0;
var examAnswers = {};  // qId -> ตัวเลือกที่เลือก
var examPool = [];     // ชุดคำถามที่ได้จาก Cloud Function (ไม่มีเฉลย)

var PAGE_META = {
  'home':          ['หน้าแรก', 'ภาพรวมการอบรมและความคืบหน้าของคุณ'],
  'profile':       ['ข้อมูลส่วนตัว', 'ข้อมูลนี้จะปรากฏบนเกียรติบัตรของคุณ กรุณากรอกให้ถูกต้อง'],
  'my-trainings':  ['การอบรมของฉัน', 'รายการอบรมที่คุณลงทะเบียน ความคืบหน้า และเกียรติบัตร'],
  'catalog':       ['หลักสูตรอบรม', 'หลักสูตรอบรมทั้งหมดที่เปิดให้ลงทะเบียนในขณะนี้']
};

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
}); }

function doSignIn() {
  document.getElementById('signinError').style.display = 'none';
  signInWithSchoolGoogle().catch(function(err) {
    var el = document.getElementById('signinError');
    el.textContent = err.message || 'ล็อกอินไม่สำเร็จ';
    el.style.display = 'block';
  });
}

auth.onAuthStateChanged(function(user) {
  if (!user) {
    document.getElementById('signinScreen').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
    return;
  }
  currentUser = user;
  document.getElementById('signinScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  document.getElementById('userLabel').textContent = user.email;
  checkStaffMenu();
  trackLogin();
  loadData();
});

/* แสดงเมนู "เจ้าหน้าที่" ในไซด์บาร์เฉพาะบัญชีที่มีสิทธิ์แอดมิน (admins/{email}.permissions.training === true)
   ผู้ใช้ทั่วไปจะไม่เห็นเมนูนี้เลย — การกันสิทธิ์จริงยังคงอยู่ที่ admin.html/admin.js เสมอ
   จุดนี้แค่ซ่อน-แสดงลิงก์ให้ตรงกับสิทธิ์ ไม่ใช่กลไกความปลอดภัย */
function checkStaffMenu() {
  db.collection('admins').doc(currentUser.email).get().then(function(doc) {
    var isStaff = doc.exists && doc.data().permissions && doc.data().permissions.training === true;
    var el = document.getElementById('staffMenuSection');
    if (el) el.style.display = isStaff ? 'block' : 'none';
  }).catch(function() {
    var el = document.getElementById('staffMenuSection');
    if (el) el.style.display = 'none';
  });
}

/* บันทึก/อัปเดตข้อมูลผู้ที่ล็อกอินเข้าระบบไว้ที่ app_users/{email}
   ใช้แสดงในหน้า "รายชื่อผู้ใช้งาน" ฝั่งเจ้าหน้าที่ — เขียนได้แค่เอกสารของตัวเอง (ดู firestore.rules) */
function trackLogin() {
  db.collection('app_users').doc(currentUser.email).set({
    email: currentUser.email,
    displayName: currentUser.displayName || '',
    photoURL: currentUser.photoURL || '',
    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
    loginCount: firebase.firestore.FieldValue.increment(1)
  }, { merge: true }).catch(function(err) { console.warn('trackLogin failed:', err.message); });
}

/* ══════════════════════ นำทางระหว่างหน้า (SPA state) ══════════════════════ */
function goToView(v) {
  view = v;
  activeCourseId = null;
  document.querySelectorAll('.sidebar-btn[data-view]').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-view') === v);
  });
  renderView();
  if (typeof toggleLabSidebar === 'function') toggleLabSidebar(false);
}

function loadData() {
  Promise.all([
    db.collection('training_courses').where('status', '==', 'published').get(),
    db.collection('training_enrollments').where('userEmail', '==', currentUser.email).get(),
    db.collection('profiles').doc(currentUser.email).get()
  ]).then(function(results) {
    courses = results[0].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    enrollMap = {};
    results[1].docs.forEach(function(d) { var e = Object.assign({ id: d.id }, d.data()); enrollMap[e.courseId] = e; });
    myProfile = results[2].exists ? results[2].data() : null;
    // โหลดบทเรียนของแต่ละคอร์ส (subcollection) แบบขนาน
    return Promise.all(courses.map(function(c) {
      return db.collection('training_courses').doc(c.id).collection('lessons').orderBy('order').get()
        .then(function(snap) { c.lessons = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }); });
    }));
  }).then(renderView).catch(function(err) {
    document.getElementById('body').innerHTML = '<div class="panel empty">โหลดข้อมูลไม่สำเร็จ: ' + esc(err.message) + '</div>';
  });
}

function renderView() {
  var meta = PAGE_META[view] || (view === 'detail' ? [findCourse(activeCourseId) ? findCourse(activeCourseId).title : 'หลักสูตร', 'เรียนเนื้อหาให้ครบตามลำดับ แล้วทำแบบทดสอบเพื่อรับเกียรติบัตร'] : PAGE_META.home);
  document.getElementById('pageTitle').textContent = meta[0];
  document.getElementById('pageDesc').textContent = meta[1];

  var html;
  if (view === 'detail') html = renderDetail(activeCourseId);
  else if (view === 'profile') html = renderProfile();
  else if (view === 'my-trainings') html = renderMyTrainings();
  else if (view === 'catalog') html = renderCatalog();
  else html = renderHome();
  document.getElementById('body').innerHTML = html;
  lucide.createIcons();
}

/* ══════════════════════ หน้าแรก (แดชบอร์ด) ══════════════════════ */
function renderHome() {
  var enrolledCount = Object.keys(enrollMap).length;
  var passedCount = Object.values(enrollMap).filter(function(e) { return e.status === 'passed'; }).length;
  var inProgressCount = Object.values(enrollMap).filter(function(e) { return e.status === 'learning'; }).length;

  var stats = '<div class="stat-grid">' +
    statCard('book-open', courses.length, 'หลักสูตรที่เปิดอบรม') +
    statCard('graduation-cap', enrolledCount, 'ลงทะเบียนแล้ว') +
    statCard('loader', inProgressCount, 'กำลังเรียน') +
    statCard('award', passedCount, 'ผ่านเกณฑ์แล้ว') +
    '</div>';

  var profileBanner = (!myProfile || !myProfile.fullName) ?
    '<div class="panel" style="border-color:var(--c-amber-tint);background:var(--c-amber-pale);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<div><b style="font-size:13.5px;">ยังไม่ได้กรอกข้อมูลส่วนตัว</b><p style="font-size:12.5px;color:var(--ink-soft);margin-top:2px;">กรอกชื่อ-นามสกุลให้ถูกต้องก่อนสอบผ่าน เพื่อให้ปรากฏบนเกียรติบัตรอย่างถูกต้อง</p></div>' +
      '<button class="btn btn-brass" onclick="goToView(\'profile\')"><i data-lucide="user" style="width:14px;height:14px;"></i> กรอกข้อมูล</button>' +
    '</div>' : '';

  var openCourses = courses.slice(0, 4);
  var listHtml = openCourses.length ? '<div class="grid-cards">' + openCourses.map(courseCardHtml).join('') + '</div>' :
    '<div class="panel empty">ยังไม่มีหลักสูตรที่เปิดอบรมในขณะนี้</div>';

  return stats + profileBanner +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<h3 style="font-size:15px;">หลักสูตรที่เปิดอบรม</h3>' +
      (courses.length > 4 ? '<button class="btn btn-outline" onclick="goToView(\'catalog\')">ดูทั้งหมด</button>' : '') +
    '</div>' + listHtml;
}

function statCard(icon, num, label) {
  return '<div class="panel stat-card"><div class="stat-icon"><i data-lucide="' + icon + '" style="width:19px;height:19px;"></i></div>' +
    '<div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
}

/* ══════════════════════ ข้อมูลส่วนตัว ══════════════════════ */
function renderProfile() {
  var p = myProfile || {};
  return '<div class="panel" style="max-width:560px;">' +
    '<div class="field"><label>คำนำหน้า</label>' +
      '<select id="pfPrefix">' +
        ['นาย','นาง','นางสาว','อื่นๆ'].map(function(o) { return '<option' + (p.prefix===o?' selected':'') + '>' + o + '</option>'; }).join('') +
      '</select></div>' +
    '<div class="field-row">' +
      '<div class="field"><label>ชื่อ</label><input id="pfFirst" value="' + esc(p.firstName) + '"></div>' +
      '<div class="field"><label>นามสกุล</label><input id="pfLast" value="' + esc(p.lastName) + '"></div>' +
    '</div>' +
    '<div class="field"><label>ตำแหน่ง/หน่วยงาน (ถ้ามี)</label><input id="pfPosition" value="' + esc(p.position) + '"></div>' +
    '<p style="font-size:12px;color:var(--ink-soft);margin:-4px 0 14px;">อีเมล: ' + esc(currentUser.email) + ' (ใช้ล็อกอิน แก้ไขไม่ได้)</p>' +
    '<button class="btn btn-brass" onclick="saveProfile()"><i data-lucide="save" style="width:15px;height:15px;"></i> บันทึกข้อมูล</button>' +
    '<span id="pfSaved" style="display:none;color:var(--sage);font-size:12.5px;margin-left:10px;">บันทึกแล้ว</span>' +
  '</div>';
}

function saveProfile() {
  var first = document.getElementById('pfFirst').value.trim();
  var last = document.getElementById('pfLast').value.trim();
  if (!first || !last) { alert('กรุณากรอกชื่อและนามสกุล'); return; }
  var data = {
    prefix: document.getElementById('pfPrefix').value,
    firstName: first,
    lastName: last,
    fullName: document.getElementById('pfPrefix').value + first + ' ' + last,
    position: document.getElementById('pfPosition').value.trim(),
    email: currentUser.email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.collection('profiles').doc(currentUser.email).set(data, { merge: true }).then(function() {
    myProfile = Object.assign({}, myProfile, data);
    var el = document.getElementById('pfSaved');
    if (el) { el.style.display = 'inline'; setTimeout(function() { el.style.display = 'none'; }, 2500); }
  }).catch(function(err) { alert('บันทึกไม่สำเร็จ: ' + err.message); });
}

/* ══════════════════════ การอบรมของฉัน ══════════════════════ */
function renderMyTrainings() {
  var entries = Object.keys(enrollMap).map(function(cid) { return { course: findCourse(cid) || { id: cid, title: '(หลักสูตรถูกลบ/ปิดแล้ว)', lessons: [] }, enr: enrollMap[cid] }; });
  if (!entries.length) return '<div class="panel empty">ยังไม่ได้ลงทะเบียนอบรมหลักสูตรใด<br><button class="btn btn-brass" style="margin-top:10px;" onclick="goToView(\'catalog\')">ไปที่หลักสูตรอบรม</button></div>';

  var rows = entries.map(function(x) {
    var c = x.course, enr = x.enr;
    var tag = enr.status === 'passed' ? '<span class="tag tag-pass">ผ่านแล้ว</span>'
      : enr.status === 'failed' ? '<span class="tag tag-fail">ยังไม่ผ่าน</span>'
      : '<span class="tag tag-progress">กำลังเรียน</span>';
    var done = (enr.completedLessons || []).length;
    var total = (c.lessons || []).length || 1;
    return '<tr><td><b>' + esc(c.title) + '</b><br><span style="font-size:11px;color:var(--ink-soft);">' + done + '/' + total + ' บทเรียน</span></td>' +
      '<td>' + tag + '</td><td>' + (enr.examScore == null ? '-' : enr.examScore + '%') + '</td>' +
      '<td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">' +
        '<button class="btn btn-outline" onclick="openCourse(\'' + c.id + '\',\'my-trainings\')"><i data-lucide="arrow-right" style="width:13px;height:13px;"></i> เข้าเรียนต่อ</button>' +
        (enr.status === 'passed' ? '<button class="btn btn-brass" onclick="fetchCertificate(\'' + c.id + '\')"><i data-lucide="download" style="width:13px;height:13px;"></i> เกียรติบัตร</button>' : '') +
      '</td></tr>';
  }).join('');

  return '<div class="panel" style="padding:0;overflow-x:auto;"><table><thead><tr><th>หลักสูตร</th><th>สถานะ</th><th>คะแนน</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* ══════════════════════ หลักสูตรอบรม (แคตตาล็อกทั้งหมด) ══════════════════════ */
function renderCatalog() {
  if (!courses.length) return '<div class="panel empty">ยังไม่มีหลักสูตรที่เปิดอบรมในขณะนี้</div>';
  return '<div class="grid-cards">' + courses.map(courseCardHtml).join('') + '</div>';
}

function courseCardHtml(c) {
  var enr = enrollMap[c.id];
  var tag = !enr ? '<span class="tag tag-wait">ยังไม่ลงทะเบียน</span>'
    : enr.status === 'passed' ? '<span class="tag tag-pass">ผ่านแล้ว</span>'
    : enr.status === 'failed' ? '<span class="tag tag-fail">ยังไม่ผ่าน</span>'
    : '<span class="tag tag-progress">กำลังเรียน</span>';
  var done = enr ? (enr.completedLessons || []).length : 0;
  var total = c.lessons.length || 1;
  return '<div class="panel course-card">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;"><h3>' + esc(c.title) + '</h3>' + tag + '</div>' +
    '<p style="font-size:13px;color:var(--ink-soft);">' + esc(c.desc) + '</p>' +
    '<div class="progress-track"><div class="progress-fill" style="width:' + Math.round(100 * done / total) + '%"></div></div>' +
    '<div class="meta">' + c.lessons.length + ' บทเรียน · ผ่านเกณฑ์ ' + c.passScore + '%</div>' +
    '<button class="btn btn-brass btn-block" onclick="openCourse(\'' + c.id + '\',\'catalog\')">' + (enr ? 'เข้าเรียนต่อ' : 'ลงทะเบียนเรียน') + '</button>' +
  '</div>';
}

function openCourse(courseId, from) {
  returnView = from || 'catalog';
  var enr = enrollMap[courseId];
  var go = function() { activeCourseId = courseId; activeLessonIdx = 0; view = 'detail'; renderView(); };
  if (enr) { go(); return; }
  var data = { courseId: courseId, userEmail: currentUser.email, userName: currentUser.displayName || currentUser.email, status: 'learning', completedLessons: [], examScore: null, enrolledAt: firebase.firestore.FieldValue.serverTimestamp() };
  db.collection('training_enrollments').add(data).then(function(ref) {
    enrollMap[courseId] = Object.assign({ id: ref.id }, data);
    go();
  });
}

function backToList() { goToView(returnView); }

function findCourse(id) { return courses.filter(function(c) { return c.id === id; })[0]; }

function youTubeEmbed(url) {
  // รองรับ https://youtu.be/ID และ https://www.youtube.com/watch?v=ID
  var id = '';
  var m1 = url.match(/youtu\.be\/([\w-]+)/);
  var m2 = url.match(/[?&]v=([\w-]+)/);
  if (m1) id = m1[1]; else if (m2) id = m2[1];
  if (!id) return '<p style="color:var(--rust);font-size:13px;">ลิงก์วิดีโอไม่ถูกต้อง</p>';
  return '<div class="video-frame"><iframe src="https://www.youtube.com/embed/' + id + '" allowfullscreen title="วิดีโอบทเรียน"></iframe></div>';
}

function renderDetail(courseId) {
  var c = findCourse(courseId);
  var enr = enrollMap[courseId];
  var doneIds = enr.completedLessons || [];
  var lesson = c.lessons[activeLessonIdx];
  var allDone = c.lessons.length > 0 && c.lessons.every(function(l) { return doneIds.indexOf(l.id) > -1; });

  // บังคับลำดับ: บทที่ i ปลดล็อกเมื่อบทที่ i-1 เรียนจบแล้วเท่านั้น
  var nav = c.lessons.map(function(l, i) {
    var done = doneIds.indexOf(l.id) > -1;
    var unlocked = i === 0 || doneIds.indexOf(c.lessons[i - 1].id) > -1;
    var cls = 'lesson-nav-item' + (i === activeLessonIdx ? ' current' : '') + (!unlocked ? ' locked' : '');
    var icon = done ? 'circle-check' : (unlocked ? (l.type === 'video' ? 'play-circle' : 'file-text') : 'lock');
    return '<div class="' + cls + '" onclick="' + (unlocked ? ('activeLessonIdx=' + i + ';renderView();') : '') + '">' +
      '<i data-lucide="' + icon + '" style="width:15px;height:15px;"></i><span>' + esc(l.title) + '</span></div>';
  }).join('');

  if (!c.lessons.length) {
    return backBtn() + '<div class="panel empty">หลักสูตรนี้ยังไม่มีเนื้อหา</div>';
  }

  var body = lesson.type === 'video' ? youTubeEmbed(lesson.videoUrl || '') :
    '<p style="white-space:pre-wrap;">' + esc(lesson.body) + '</p>';

  return backBtn() +
    '<div class="lesson-layout">' +
      '<div class="panel" style="padding:10px;">' + nav + '</div>' +
      '<div class="panel">' +
        '<h3>' + esc(lesson.title) + '</h3><div style="margin-top:12px;">' + body + '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:20px;">' +
          '<button class="btn btn-outline" onclick="markComplete(\'' + lesson.id + '\')"><i data-lucide="check" style="width:15px;height:15px;"></i> ทำเครื่องหมายว่าเรียนแล้ว</button>' +
          (allDone ? '<button class="btn btn-brass" onclick="startExam()">เข้าสู่บทสอบ →</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
}

function backBtn() {
  return '<button class="btn btn-outline" style="margin-bottom:14px;" onclick="backToList()"><i data-lucide="arrow-left" style="width:15px;height:15px;"></i> กลับ</button>';
}

function markComplete(lessonId) {
  var enr = enrollMap[activeCourseId];
  if (!enr.completedLessons) enr.completedLessons = [];
  if (enr.completedLessons.indexOf(lessonId) === -1) enr.completedLessons.push(lessonId);
  db.collection('training_enrollments').doc(enr.id).update({ completedLessons: enr.completedLessons })
    .then(function() { renderView(); });
}

/* ══════════════════════ ข้อสอบ — ตรวจฝั่ง server เท่านั้น ══════════════════════ */
function startExam() {
  document.getElementById('examModalBody').innerHTML = '<p style="text-align:center;padding:30px;">กำลังเตรียมข้อสอบ...</p>';
  document.getElementById('examModal').classList.add('open');
  var getExamQuestions = functions.httpsCallable('getExamQuestions');
  getExamQuestions({ courseId: activeCourseId }).then(function(res) {
    examPool = res.data.questions; // [{id, text, choices}] — ไม่มีฟิลด์ correct ติดมาเลย เพราะฝั่ง server กรองออกให้
    examAnswers = {};
    renderExam();
  }).catch(function(err) {
    document.getElementById('examModalBody').innerHTML = '<p style="color:var(--rust);">โหลดข้อสอบไม่สำเร็จ: ' + esc(err.message) + '</p>';
  });
}

function renderExam() {
  var c = findCourse(activeCourseId);
  var html = '<div class="modal-head"><div><h3>แบบทดสอบ: ' + esc(c.title) + '</h3><p>ต้องได้อย่างน้อย ' + c.passScore + '% จึงจะผ่าน</p></div>' +
    '<button class="modal-close" onclick="closeExam()">&times;</button></div>';
  examPool.forEach(function(q, qi) {
    html += '<div class="field"><label style="font-size:14px;color:var(--ink);">' + (qi + 1) + '. ' + esc(q.text) + '</label>';
    q.choices.forEach(function(choice, ci) {
      html += '<label class="choice"><input type="radio" name="q_' + q.id + '" value="' + ci + '" onchange="examAnswers[\'' + q.id + '\']=' + ci + '"><span>' + esc(choice) + '</span></label>';
    });
    html += '</div>';
  });
  html += '<p id="examErr" style="display:none;color:var(--rust);font-size:13px;">กรุณาตอบให้ครบทุกข้อ</p>' +
    '<button class="btn btn-brass btn-block" onclick="submitExamAnswers()">ส่งคำตอบ</button>';
  document.getElementById('examModalBody').innerHTML = html;
}

function closeExam() { document.getElementById('examModal').classList.remove('open'); }

function submitExamAnswers() {
  if (Object.keys(examAnswers).length < examPool.length) {
    document.getElementById('examErr').style.display = 'block'; return;
  }
  var btn = event.target; btn.disabled = true; btn.textContent = 'กำลังตรวจ...';
  var submitExam = functions.httpsCallable('submitExam');
  submitExam({ courseId: activeCourseId, answers: examAnswers }).then(function(res) {
    // res.data = { score, passed } — คำนวณจาก server เท่านั้น ไม่มีทางแก้ค่าจาก client ได้
    closeExam();
    enrollMap[activeCourseId].status = res.data.passed ? 'passed' : 'failed';
    enrollMap[activeCourseId].examScore = res.data.score;
    renderResult(res.data.score, res.data.passed);
    renderView();
  }).catch(function(err) {
    btn.disabled = false; btn.textContent = 'ส่งคำตอบ';
    showAlert('ส่งคำตอบไม่สำเร็จ: ' + err.message);
  });
}

function renderResult(score, passed) {
  document.getElementById('resultModalBody').innerHTML =
    '<div style="text-align:center;">' +
      '<h3 style="font-size:19px;">คะแนน ' + score + '%</h3>' +
      '<p style="color:var(--ink-soft);margin:8px 0 18px;">' + (passed ? 'ยินดีด้วย คุณผ่านเกณฑ์แล้ว เกียรติบัตรกำลังถูกออกให้อัตโนมัติ' : 'ยังไม่ผ่านเกณฑ์ ทบทวนเนื้อหาแล้วลองสอบใหม่อีกครั้ง') + '</p>' +
      (passed
        ? '<button class="btn btn-brass btn-block" onclick="fetchCertificate(\'' + activeCourseId + '\')">ดูเกียรติบัตร</button>'
        : '<button class="btn btn-outline btn-block" onclick="closeResult()">ปิด</button>') +
    '</div>';
  document.getElementById('resultModal').classList.add('open');
}
function closeResult() { document.getElementById('resultModal').classList.remove('open'); }

function fetchCertificate(courseId) {
  // เกียรติบัตรถูกสร้างโดย Cloud Function (trigger เมื่อ enrollment.status -> passed)
  // อาจใช้เวลาไม่กี่วินาที จึง poll ดู training_certificates
  var tries = 0;
  var poll = setInterval(function() {
    tries++;
    db.collection('training_certificates').where('courseId', '==', courseId).where('userEmail', '==', currentUser.email).limit(1).get()
      .then(function(snap) {
        if (!snap.empty) {
          clearInterval(poll);
          window.open(snap.docs[0].data().pdfUrl, '_blank');
        } else if (tries > 8) {
          clearInterval(poll);
          showAlert('เกียรติบัตรกำลังเตรียมอยู่ ลองกดดูใหม่อีกครั้งในหน้า "การอบรมของฉัน"');
        }
      });
  }, 1500);
}

function showAlert(msg) { alert(msg); }
