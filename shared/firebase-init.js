// =========================================================
// NP-LearnLab — Firebase Init
// แก้ค่า config ด้านล่างเป็นของโปรเจกต์ Firebase จริงของคุณ
// (Firebase Console → Project settings → General → Your apps → Web app)
// =========================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
// ถ้าต้องการจำกัดเฉพาะโดเมนองค์กร ให้ปลดคอมเมนต์บรรทัดล่าง แล้วใส่โดเมนของคุณ
// googleProvider.setCustomParameters({ hd: "your-domain.ac.th" });

// อีเมล super admin เริ่มต้นของระบบ — ได้สิทธิ์ staff/admin เสมอแม้ยังไม่มีเอกสาร users/{uid}
const SUPER_ADMIN_EMAIL = "nattapol@nongki.ac.th";
