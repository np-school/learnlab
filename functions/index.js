/* ══════════════════════════════════════════════════════════
   NP-LearnLab · Cloud Functions
   ทุกจุดที่แตะ "เฉลยข้อสอบ" หรือ "การตัดสินผ่าน/ไม่ผ่าน" ต้องอยู่ในไฟล์นี้เท่านั้น
   ห้ามให้ client คำนวณคะแนนเอง — ไม่งั้นแก้ค่าใน DevTools แล้วผ่านได้ทันที
   ══════════════════════════════════════════════════════════ */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/* ──────────────────────────────────────────────────────────
   getExamQuestions — คืนชุดคำถามที่สุ่มแล้ว "ไม่มีฟิลด์ correct" ติดไปเลย
   client เรียกฟังก์ชันนี้แทนการ query subcollection 'questions' ตรงๆ
   (แม้ query ตรงก็ปลอดภัยเพราะ correct อยู่คนละ collection แต่การสุ่ม+จำกัด
   จำนวนข้อควรทำฝั่ง server เพื่อไม่ให้ client เห็นคลังข้อสอบทั้งหมด)
   ────────────────────────────────────────────────────────── */
exports.getExamQuestions = functions.region('asia-southeast1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'กรุณาล็อกอิน');
  const courseId = data.courseId;
  const courseSnap = await db.collection('training_courses').doc(courseId).get();
  if (!courseSnap.exists || courseSnap.data().status !== 'published') {
    throw new functions.https.HttpsError('failed-precondition', 'ไม่พบหลักสูตรนี้');
  }
  const course = courseSnap.data();
  const qSnap = await db.collection('training_courses').doc(courseId).collection('questions').get();
  const pool = qSnap.docs.map(d => ({ id: d.id, text: d.data().text, choices: d.data().choices }));
  const count = Math.min(course.examQuestionCount || pool.length, pool.length);
  const selected = shuffle(pool).slice(0, count);
  return { questions: selected };
});

/* ──────────────────────────────────────────────────────────
   submitExam — รับคำตอบ (ตัวเลือกที่เลือกต่อข้อ), ตรวจกับ answerKeys
   ในเซิร์ฟเวอร์เท่านั้น แล้วเขียนผลลง training_enrollments
   ────────────────────────────────────────────────────────── */
exports.submitExam = functions.region('asia-southeast1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'กรุณาล็อกอิน');
  const userEmail = context.auth.token.email;
  const { courseId, answers } = data;

  const courseRef = db.collection('training_courses').doc(courseId);
  const courseSnap = await courseRef.get();
  if (!courseSnap.exists) throw new functions.https.HttpsError('not-found', 'ไม่พบหลักสูตร');
  const course = courseSnap.data();

  const enrollSnap = await db.collection('training_enrollments')
    .where('courseId', '==', courseId).where('userEmail', '==', userEmail).limit(1).get();
  if (enrollSnap.empty) throw new functions.https.HttpsError('failed-precondition', 'ยังไม่ได้ลงทะเบียนเรียนหลักสูตรนี้');
  const enrollDoc = enrollSnap.docs[0];

  // ตรวจคำตอบทีละข้อจาก answerKeys (คนละ collection กับที่ client อ่านได้)
  const qIds = Object.keys(answers);
  const keySnaps = await Promise.all(
    qIds.map(id => courseRef.collection('answerKeys').doc(id).get())
  );
  let correctCount = 0;
  keySnaps.forEach((snap, i) => {
    if (snap.exists && snap.data().correct === answers[qIds[i]]) correctCount++;
  });
  const score = qIds.length ? Math.round((100 * correctCount) / qIds.length) : 0;
  const passed = score >= (course.passScore || 70);

  await enrollDoc.ref.update({
    examScore: score,
    status: passed ? 'passed' : 'failed',
    lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (passed) {
    await courseRef.update({ passedCount: admin.firestore.FieldValue.increment(1) });
  }

  return { score, passed };
});

/* ──────────────────────────────────────────────────────────
   onEnrollmentPassed — trigger อัตโนมัติเมื่อ status เปลี่ยนเป็น 'passed'
   สร้างเลขที่เกียรติบัตร + PDF (มี QR ฝังอยู่) + อัปโหลดขึ้น Storage
   ────────────────────────────────────────────────────────── */
exports.onEnrollmentPassed = functions.region('asia-southeast1').firestore
  .document('training_enrollments/{enrollId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === 'passed' || after.status !== 'passed') return null; // ทำครั้งเดียวตอนเพิ่งผ่าน

    const courseSnap = await db.collection('training_courses').doc(after.courseId).get();
    const course = courseSnap.data();

    // ใช้ชื่อจากหน้า "ข้อมูลส่วนตัว" (profiles/{email}.fullName) ถ้าผู้เรียนกรอกไว้แล้ว
    // เพราะเป็นชื่อที่ตั้งใจให้ปรากฏบนเกียรติบัตร แม่นยำกว่าชื่อบัญชี Google (displayName)
    const profileSnap = await db.collection('profiles').doc(after.userEmail).get();
    const certUserName = (profileSnap.exists && profileSnap.data().fullName) ? profileSnap.data().fullName : after.userName;

    // เลขที่เกียรติบัตร: NPL-{พ.ศ.}-{running number} — ใช้ transaction กันเลขชนกัน
    const yearBE = new Date().getFullYear() + 543;
    const counterRef = db.collection('training_counters').doc(String(yearBE));
    const certNo = await db.runTransaction(async (tx) => {
      const c = await tx.get(counterRef);
      const next = (c.exists ? c.data().count : 0) + 1;
      tx.set(counterRef, { count: next }, { merge: true });
      return 'NPL-' + yearBE + '-' + String(next).padStart(5, '0');
    });

    const verifyUrl = (functions.config().app && functions.config().app.base_url
      ? functions.config().app.base_url
      : 'https://np-learnlab.web.app') + '/verify.html?cert=' + certNo;

    const pdfBytes = await buildCertificatePdf({
      userName: after.userName,
      courseTitle: course.title,
      score: after.examScore,
      certNo, verifyUrl,
    });

    const filePath = `certificates/${certNo}.pdf`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });
    await file.makePublic();
    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await db.collection('training_certificates').doc(certNo).set({
      courseId: after.courseId,
      courseTitle: course.title,
      userEmail: after.userEmail,
      userName: after.userName,
      score: after.examScore,
      certNo, pdfUrl,
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return null;
  });

async function buildCertificatePdf({ userName, courseTitle, score, certNo, verifyUrl }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: rgb(0.76, 0.51, 0.18), borderWidth: 2 });
  page.drawText('CERTIFICATE OF COMPLETION', { x: 260, y: 480, size: 20, font, color: rgb(0.1, 0.14, 0.19) });
  page.drawText(userName, { x: 300, y: 400, size: 26, font, color: rgb(0.1, 0.14, 0.19) });
  page.drawText('has completed the course', { x: 340, y: 365, size: 12, font: fontReg });
  page.drawText(courseTitle, { x: 300, y: 335, size: 16, font });
  page.drawText('Score: ' + score + '%', { x: 370, y: 300, size: 12, font: fontReg });
  page.drawText('Certificate No. ' + certNo, { x: 60, y: 60, size: 10, font: fontReg });

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0 });
  const qrImage = await doc.embedPng(qrDataUrl);
  page.drawImage(qrImage, { x: 720, y: 45, width: 80, height: 80 });

  return doc.save();
}
