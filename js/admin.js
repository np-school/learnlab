/* ══════════════════════════════════════════════════════════
   NP-LearnLab · admin.js
   สำคัญ: เฉลยข้อสอบ (correct) เก็บแยกใน subcollection 'answerKeys'
   ซึ่ง Firestore rules อนุญาตให้อ่านได้เฉพาะแอดมินที่มีสิทธิ์ training เท่านั้น
   (ดู firestore.rules) — หน้าเว็บผู้เรียนจะไม่มีทางอ่านคอลเลกชันนี้ได้เลย
   ══════════════════════════════════════════════════════════ */

var currentUser = null;
var myPerms = {};     // permissions ของผู้ใช้ปัจจุบัน { training, courses, users, personnel }
var courses = [];
var editCourseId = null;
var activeTab = 'general';
var editLessonId = null;
var editQuestionId = null;

var adminView = 'dashboard'; // 'dashboard' | 'courses' | 'users' | 'personnel'
var allEnrollments = null;   // แคชไว้ใช้คำนวณแดชบอร์ด (โหลดครั้งแรกที่เข้าหน้าแรก)
var appUsers = null;         // แคช app_users (โหลดเมื่อเข้าแท็บ "รายชื่อผู้ใช้งาน")
var personnel = null;        // แคช personnel (โหลดเมื่อเข้าแท็บ "รายชื่อบุคลากร")

var ADMIN_PAGE_META = {
  dashboard:  ['หน้าแรก', 'ภาพรวมการอบรมทั้งหมด ผู้ลงทะเบียน และความคืบหน้า'],
  courses:    ['จัดการอบรมออนไลน์', 'สร้างหลักสูตร เพิ่มเนื้อหา ข้อสอบ และติดตามผู้เรียน'],
  users:      ['รายชื่อผู้ใช้งาน', 'บุคคลทั่วไปที่เคยล็อกอินเข้าใช้งานระบบ'],
  personnel:  ['รายชื่อบุคลากร', 'ข้อมูลบุคลากรที่นำเข้าโดยเจ้าหน้าที่']
};

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
    myPerms = (doc.exists && doc.data().permissions) || {};
    var allowed = myPerms.training === true || myPerms.courses === true || myPerms.users === true || myPerms.personnel === true;
    if (!allowed) {
      document.getElementById('signinScreen').style.display = 'none';
      document.getElementById('deniedScreen').style.display = 'flex';
      return;
    }
    document.getElementById('signinScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    document.getElementById('userLabel').textContent = user.email;
    applyAdminMenuPerms();
    loadData();
    // รองรับลิงก์ตรงจากเมนู "เจ้าหน้าที่" ในหน้าสมาชิก (admin.html?view=users เป็นต้น)
    // ให้เปิดหน้าที่ต้องการได้ทันทีโดยไม่ต้องเข้าหน้าแรกเจ้าหน้าที่ก่อน — แต่ยังต้องเช็คสิทธิ์รายหน้าเสมอ
    var qView = new URLSearchParams(location.search).get('view');
    if (['dashboard', 'courses', 'users', 'personnel'].indexOf(qView) > -1) goToAdminView(qView);
  });
});

/* ซ่อน/แสดงลิงก์ในไซด์บาร์ทีละอันตามสิทธิ์จริงของผู้ใช้ (data-perm="courses|users|personnel|any")
   หมายเหตุ: นี่แค่ซ่อน-แสดง UI ไม่ใช่กลไกความปลอดภัย — การกันสิทธิ์จริงอยู่ที่ firestore.rules และ hasViewPerm() ด้านล่าง */
function applyAdminMenuPerms() {
  document.querySelectorAll('#labSidebar [data-perm]').forEach(function(el) {
    var need = el.getAttribute('data-perm');
    var ok = need === 'any' ? true : myPerms[need] === true; // ถึงจุดนี้แปลว่าผ่าน allowed check มาแล้ว จึงมีสิทธิ์อย่างน้อย 1 อันเสมอ
    el.style.display = ok ? '' : 'none';
  });
}

/* เช็คว่ามีสิทธิ์เข้า view นี้จริงหรือไม่ (ใช้กันทั้งตอนกดเมนูและตอนเข้าตรงผ่าน ?view=) */
function hasViewPerm(v) {
  if (v === 'dashboard') return true; // เห็นได้ทุกคนที่ผ่าน allowed check (มีสิทธิ์อย่างน้อย 1 อัน)
  return myPerms[v] === true;
}

function loadData() {
  if (!hasViewPerm('courses')) { renderView(); return; } // ไม่มีสิทธิ์ courses ก็ไม่ต้อง query คอลเลกชันนี้เลย
  db.collection('training_courses').orderBy('createdAt', 'desc').get().then(function(snap) {
    courses = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderView();
  });
}

/* ══════════════════════ นำทางระหว่างหน้า (SPA state) ══════════════════════ */
function goToAdminView(v) {
  // กันไว้ 2 ชั้น: ทั้งกดเมนูเอง และพิมพ์/แก้ URL (?view=...) ตรงๆ โดยไม่มีสิทธิ์
  if (!hasViewPerm(v)) v = 'dashboard';
  adminView = v;
  document.querySelectorAll('.sidebar-btn[data-view]').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-view') === v);
  });
  renderView();
  if (typeof toggleLabSidebar === 'function') toggleLabSidebar(false);
}

function renderView() {
  var meta = ADMIN_PAGE_META[adminView] || ADMIN_PAGE_META.dashboard;
  document.getElementById('pageTitle').textContent = meta[0];
  document.getElementById('pageDesc').textContent = meta[1];
  document.getElementById('btnNewCourse').style.display = (adminView === 'courses' && hasViewPerm('courses')) ? 'inline-flex' : 'none';
  document.getElementById('btnUploadPersonnel').style.display = (adminView === 'personnel' && hasViewPerm('personnel')) ? 'inline-flex' : 'none';

  if (!hasViewPerm(adminView)) {
    document.getElementById('body').innerHTML = '<div class="panel empty">ไม่มีสิทธิ์เข้าถึงหน้านี้ ติดต่อ SuperAdmin เพื่อขอสิทธิ์</div>';
    return;
  }
  if (adminView === 'dashboard') { renderDashboard(); return; }
  if (adminView === 'users') { renderUsers(); return; }
  if (adminView === 'personnel') { renderPersonnel(); return; }
  document.getElementById('body').innerHTML = renderTable();
  lucide.createIcons();
}

/* ══════════════════════ หน้าแรก (แดชบอร์ดรวม) ══════════════════════ */
function renderDashboard() {
  // คนที่ไม่มีสิทธิ์ courses แต่มี users/personnel จะเข้าหน้านี้ได้ (ตามที่ตกลงไว้)
  // แต่สถิติหลักสูตร/การลงทะเบียนต้องใช้สิทธิ์ courses เท่านั้น จึงโชว์แบบย่อแทนไม่ query เลย
  if (!hasViewPerm('courses')) {
    document.getElementById('body').innerHTML =
      '<div class="panel empty">คุณไม่มีสิทธิ์ดูสถิติหลักสูตร ใช้เมนูด้านซ้ายเพื่อไปยังส่วนงานที่คุณมีสิทธิ์</div>';
    return;
  }
  document.getElementById('body').innerHTML = '<div class="empty">กำลังโหลดข้อมูล...</div>';
  var ready = allEnrollments ? Promise.resolve(allEnrollments) :
    db.collection('training_enrollments').get().then(function(snap) {
      allEnrollments = snap.docs.map(function(d) { return d.data(); });
      return allEnrollments;
    });
  ready.then(function(enrolls) {
    if (adminView !== 'dashboard') return; // ผู้ใช้สลับหน้าไปแล้วระหว่างรอโหลด
    var byCourse = {};
    enrolls.forEach(function(e) {
      if (!byCourse[e.courseId]) byCourse[e.courseId] = { enrolled: 0, learning: 0, passed: 0, failed: 0 };
      byCourse[e.courseId].enrolled++;
      byCourse[e.courseId][e.status === 'passed' ? 'passed' : e.status === 'failed' ? 'failed' : 'learning']++;
    });
    var totalEnrolled = enrolls.length;
    var totalPassed = enrolls.filter(function(e) { return e.status === 'passed'; }).length;
    var published = courses.filter(function(c) { return c.status === 'published'; }).length;

    var stats = '<div class="stat-grid">' +
      statCard('layers', courses.length, 'หลักสูตรทั้งหมด') +
      statCard('radio', published, 'เปิดรับสมัครอยู่') +
      statCard('users', totalEnrolled, 'ผู้ลงทะเบียนรวม') +
      statCard('award', totalPassed, 'ผ่านเกณฑ์รวม') +
      '</div>';

    var rows = courses.length ? courses.map(function(c) {
      var s = byCourse[c.id] || { enrolled: 0, learning: 0, passed: 0, failed: 0 };
      var pct = s.enrolled ? Math.round(100 * s.passed / s.enrolled) : 0;
      var statusTag = { draft: '<span class="tag tag-wait">ฉบับร่าง</span>', published: '<span class="tag tag-pass">เผยแพร่แล้ว</span>', closed: '<span class="tag tag-fail">ปิดรับสมัคร</span>' };
      return '<tr><td><b>' + esc(c.title) + '</b><br>' + (statusTag[c.status] || '') + '</td>' +
        '<td>' + s.enrolled + ' คน</td><td>' + s.learning + ' คน</td><td>' + s.passed + ' คน</td><td>' + s.failed + ' คน</td>' +
        '<td style="min-width:110px;"><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div><span style="font-size:11px;color:var(--ink-soft);">' + pct + '% ผ่าน</span></td>' +
        '<td style="text-align:right;"><button class="btn btn-outline" onclick="goToAdminView(\'courses\');setTimeout(function(){openCourseModal(\'' + c.id + '\');},0)"><i data-lucide="arrow-right" style="width:13px;height:13px;"></i></button></td></tr>';
    }).join('') : '';

    var table = courses.length ?
      '<div class="panel" style="padding:0;overflow-x:auto;"><table><thead><tr><th>หลักสูตร</th><th>ลงทะเบียน</th><th>กำลังเรียน</th><th>ผ่าน</th><th>ไม่ผ่าน</th><th>อัตราผ่าน</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="panel empty">ยังไม่มีหลักสูตร ไปที่เมนู "หลักสูตรอบรม" เพื่อสร้างหลักสูตรแรก</div>';

    document.getElementById('body').innerHTML = stats + table;
    lucide.createIcons();
  }).catch(function(err) {
    document.getElementById('body').innerHTML = '<div class="panel empty">โหลดข้อมูลไม่สำเร็จ: ' + esc(err.message) + '</div>';
  });
}

function statCard(icon, num, label) {
  return '<div class="panel stat-card"><div class="stat-icon"><i data-lucide="' + icon + '" style="width:19px;height:19px;"></i></div>' +
    '<div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
}

/* ══════════════════════ รายชื่อผู้ใช้งาน (บุคคลทั่วไปที่ล็อกอิน) ══════════════════════ */
function renderUsers() {
  document.getElementById('body').innerHTML = '<div class="empty">กำลังโหลดข้อมูล...</div>';
  var ready = appUsers ? Promise.resolve(appUsers) :
    db.collection('app_users').orderBy('lastLoginAt', 'desc').get().then(function(snap) {
      appUsers = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
      return appUsers;
    });
  ready.then(function(list) {
    if (adminView !== 'users') return;
    if (!list.length) { document.getElementById('body').innerHTML = '<div class="panel empty">ยังไม่มีผู้ใช้งานล็อกอินเข้าระบบ</div>'; return; }
    var rows = list.map(function(u) {
      var last = u.lastLoginAt && u.lastLoginAt.toDate ? u.lastLoginAt.toDate().toLocaleString('th-TH') : '-';
      return '<tr><td><b>' + esc(u.displayName || '-') + '</b><br><span style="font-size:11px;color:var(--ink-soft);">' + esc(u.email) + '</span></td>' +
        '<td>' + (u.loginCount || 1) + ' ครั้ง</td><td>' + last + '</td></tr>';
    }).join('');
    document.getElementById('body').innerHTML =
      '<p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px;">รายชื่อทุกบัญชี @nongki.ac.th ที่เคยล็อกอินเข้าหน้าสมาชิก ทั้งหมด ' + list.length + ' คน</p>' +
      '<div class="panel" style="padding:0;overflow-x:auto;"><table><thead><tr><th>ชื่อ / อีเมล</th><th>จำนวนครั้งที่ล็อกอิน</th><th>ล็อกอินล่าสุด</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    lucide.createIcons();
  }).catch(function(err) {
    document.getElementById('body').innerHTML = '<div class="panel empty">โหลดข้อมูลไม่สำเร็จ: ' + esc(err.message) + '</div>';
  });
}

/* ══════════════════════ รายชื่อบุคลากร (นำเข้าโดยเจ้าหน้าที่) ══════════════════════ */
function renderPersonnel() {
  document.getElementById('body').innerHTML = '<div class="empty">กำลังโหลดข้อมูล...</div>';
  var ready = personnel ? Promise.resolve(personnel) :
    db.collection('personnel').orderBy('fullName').get().then(function(snap) {
      personnel = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
      return personnel;
    });
  ready.then(function(list) {
    if (adminView !== 'personnel') return;
    var uploadHint = '<div class="upload-box">' +
      'อัพโหลดไฟล์ CSV รายชื่อบุคลากร (คอลัมน์: <code>employeeId,fullName,position,department,email</code>) กดปุ่ม "อัพโหลดรายชื่อ (CSV)" มุมขวาบน หรือเพิ่มทีละคนด้านล่าง<br>' +
      '<button class="btn btn-outline" style="margin-top:8px;" onclick="openPersonnelModal(null)"><i data-lucide="user-plus" style="width:13px;height:13px;"></i> เพิ่มบุคลากรทีละคน</button>' +
    '</div>';
    if (!list.length) { document.getElementById('body').innerHTML = uploadHint + '<div class="panel empty">ยังไม่มีข้อมูลบุคลากรในระบบ</div>'; lucide.createIcons(); return; }
    var rows = list.map(function(p) {
      return '<tr><td><b>' + esc(p.fullName) + '</b><br><span style="font-size:11px;color:var(--ink-soft);">' + esc(p.employeeId || '-') + '</span></td>' +
        '<td>' + esc(p.position || '-') + '</td><td>' + esc(p.department || '-') + '</td><td>' + esc(p.email || '-') + '</td>' +
        '<td style="text-align:right;display:flex;gap:5px;justify-content:flex-end;">' +
          '<button class="btn btn-outline" onclick="openPersonnelModal(\'' + p.id + '\')"><i data-lucide="edit" style="width:13px;height:13px;"></i></button>' +
          '<button class="btn btn-outline" onclick="deletePersonnel(\'' + p.id + '\')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>' +
        '</td></tr>';
    }).join('');
    document.getElementById('body').innerHTML = uploadHint +
      '<p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px;">ทั้งหมด ' + list.length + ' คน</p>' +
      '<div class="panel" style="padding:0;overflow-x:auto;"><table><thead><tr><th>ชื่อ-สกุล / รหัส</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>อีเมล</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    lucide.createIcons();
  }).catch(function(err) {
    document.getElementById('body').innerHTML = '<div class="panel empty">โหลดข้อมูลไม่สำเร็จ: ' + esc(err.message) + '</div>';
  });
}

function openPersonnelModal(id) {
  var p = id ? (personnel || []).filter(function(x) { return x.id === id; })[0] : { employeeId: '', fullName: '', position: '', department: '', email: '' };
  document.getElementById('personnelModalBody').innerHTML =
    '<div class="modal-head"><div><h3>' + (id ? 'แก้ไขข้อมูลบุคลากร' : 'เพิ่มบุคลากร') + '</h3></div><button class="modal-close" onclick="closePersonnelModal()">&times;</button></div>' +
    '<div class="field"><label>รหัสประจำตัว</label><input id="pnId" value="' + esc(p.employeeId) + '"' + (id ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>ชื่อ-นามสกุล</label><input id="pnName" value="' + esc(p.fullName) + '"></div>' +
    '<div class="field-row">' +
      '<div class="field"><label>ตำแหน่ง</label><input id="pnPosition" value="' + esc(p.position) + '"></div>' +
      '<div class="field"><label>หน่วยงาน</label><input id="pnDept" value="' + esc(p.department) + '"></div>' +
    '</div>' +
    '<div class="field"><label>อีเมล (ถ้ามี)</label><input id="pnEmail" value="' + esc(p.email) + '"></div>' +
    '<button class="btn btn-brass" onclick="savePersonnel(\'' + (id || '') + '\')"><i data-lucide="save" style="width:15px;height:15px;"></i> บันทึก</button>';
  document.getElementById('personnelModal').classList.add('open'); lucide.createIcons();
}
function closePersonnelModal() { document.getElementById('personnelModal').classList.remove('open'); }

function savePersonnel(id) {
  var empId = id || document.getElementById('pnId').value.trim();
  var name = document.getElementById('pnName').value.trim();
  if (!empId || !name) { alert('กรุณากรอกรหัสประจำตัวและชื่อ-นามสกุล'); return; }
  var data = {
    employeeId: empId,
    fullName: name,
    position: document.getElementById('pnPosition').value.trim(),
    department: document.getElementById('pnDept').value.trim(),
    email: document.getElementById('pnEmail').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.email
  };
  db.collection('personnel').doc(empId).set(data, { merge: true }).then(function() {
    personnel = null; // บังคับโหลดใหม่
    closePersonnelModal(); renderPersonnel();
  }).catch(function(err) { alert('บันทึกไม่สำเร็จ: ' + err.message); });
}

function deletePersonnel(id) {
  if (!confirm('ลบข้อมูลบุคลากรคนนี้ใช่หรือไม่?')) return;
  db.collection('personnel').doc(id).delete().then(function() {
    personnel = (personnel || []).filter(function(p) { return p.id !== id; });
    renderPersonnel();
  }).catch(function(err) { alert('ลบไม่สำเร็จ: ' + err.message); });
}

/* อัพโหลดไฟล์ CSV รายชื่อบุคลากรแบบกลุ่ม (คอลัมน์: employeeId,fullName,position,department,email) */
function handlePersonnelCSV(fileInput) {
  var file = fileInput.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var lines = String(e.target.result).split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) { alert('ไฟล์ว่างเปล่าหรือไม่มีข้อมูล'); fileInput.value = ''; return; }
    var header = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
    var idx = {
      id: header.indexOf('employeeid'), name: header.indexOf('fullname'),
      position: header.indexOf('position'), dept: header.indexOf('department'), email: header.indexOf('email')
    };
    if (idx.id === -1 || idx.name === -1) { alert('ไฟล์ CSV ต้องมีคอลัมน์ employeeId และ fullName อย่างน้อย'); fileInput.value = ''; return; }
    var rows = lines.slice(1).map(function(l) { return l.split(','); }).filter(function(cols) { return (cols[idx.id] || '').trim(); });
    if (!rows.length) { alert('ไม่พบแถวข้อมูลที่ใช้ได้'); fileInput.value = ''; return; }

    var chunkSize = 400, chunks = [];
    for (var i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize));
    var chain = Promise.resolve();
    chunks.forEach(function(chunk) {
      chain = chain.then(function() {
        var batch = db.batch();
        chunk.forEach(function(cols) {
          var empId = cols[idx.id].trim();
          var ref = db.collection('personnel').doc(empId);
          batch.set(ref, {
            employeeId: empId,
            fullName: (cols[idx.name] || '').trim(),
            position: idx.position > -1 ? (cols[idx.position] || '').trim() : '',
            department: idx.dept > -1 ? (cols[idx.dept] || '').trim() : '',
            email: idx.email > -1 ? (cols[idx.email] || '').trim() : '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.email
          }, { merge: true });
        });
        return batch.commit();
      });
    });
    chain.then(function() {
      alert('อัพโหลดสำเร็จ ' + rows.length + ' รายการ');
      personnel = null; fileInput.value = ''; renderPersonnel();
    }).catch(function(err) { alert('อัพโหลดไม่สำเร็จ: ' + err.message); fileInput.value = ''; });
  };
  reader.readAsText(file, 'UTF-8');
}

/* ══════════════════════ จัดการหลักสูตร (เดิม) ══════════════════════ */
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
