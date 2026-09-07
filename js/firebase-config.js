/* ══════════════════════════════════════════════════════════
   ตั้งค่า Firebase ของโปรเจกต์ "NP-LearnLab" (แยกจาก NP Origins)
   ไปเอาค่านี้จาก Firebase Console → Project settings → Your apps
   ══════════════════════════════════════════════════════════ */
var firebaseConfig = {
apiKey: "AIzaSyBQ_9K3feSQwWW5fSUMtXKzhZRvXcH1-6U",
  authDomain: "np-learnlab.firebaseapp.com",
  projectId: "np-learnlab",
  storageBucket: "np-learnlab.firebasestorage.app",
  messagingSenderId: "111321772789",
  appId: "1:111321772789:web:61571cc5bb0c467aa24bbc"
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db   = firebase.firestore();
var functions = firebase.functions();

/* จำกัดให้ล็อกอินได้เฉพาะโดเมนอีเมลของโรงเรียนเท่านั้น
   แก้ 'nongki.ac.th' เป็นโดเมนจริงของโรงเรียนคุณ */
var SCHOOL_DOMAIN = 'nongki.ac.th';

var googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: SCHOOL_DOMAIN }); // บังคับเลือกบัญชีในโดเมนนี้ (UI hint เท่านั้น)

/**
 * ล็อกอินด้วย Google — ตรวจซ้ำฝั่ง client ว่าอีเมลอยู่ในโดเมนโรงเรียนจริง
 * (การตรวจนี้ยังต้องมี Firestore rule / Cloud Function คู่กันเสมอ
 *  เพราะฝั่ง client แก้ไขข้ามได้ ห้ามพึ่งจุดนี้จุดเดียว)
 */
function signInWithSchoolGoogle() {
  return auth.signInWithPopup(googleProvider).then(function(result) {
    var email = result.user.email || '';
    if (email.split('@')[1] !== SCHOOL_DOMAIN) {
      return auth.signOut().then(function() {
        throw new Error('กรุณาล็อกอินด้วยอีเมลโรงเรียน (@' + SCHOOL_DOMAIN + ') เท่านั้น');
      });
    }
    return result;
  });
}
