// =========================================================
// NP-LearnLab — Firebase Init
// แก้ค่า config ด้านล่างเป็นของโปรเจกต์ Firebase จริงของคุณ
// (Firebase Console → Project settings → General → Your apps → Web app)
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyBQ_9K3feSQwWW5fSUMtXKzhZRvXcH1-6U",
  authDomain: "np-learnlab.firebaseapp.com",
  projectId: "np-learnlab",
  storageBucket: "np-learnlab.firebasestorage.app",
  messagingSenderId: "111321772789",
  appId: "1:111321772789:web:61571cc5bb0c467aa24bbc",
  measurementId: "G-4TN93P09P0"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const googleProvider = new firebase.auth.GoogleAuthProvider();
// ถ้าต้องการจำกัดเฉพาะโดเมนองค์กร ให้ปลดคอมเมนต์บรรทัดล่าง แล้วใส่โดเมนของคุณ
// googleProvider.setCustomParameters({ hd: "your-domain.ac.th" });

// อีเมล super admin เริ่มต้นของระบบ — ได้สิทธิ์ staff/admin เสมอแม้ยังไม่มีเอกสาร users/{uid}
const SUPER_ADMIN_EMAIL = "nattapol@nongki.ac.th";
