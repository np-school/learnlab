# NP-LearnLab

ระบบอบรม/เรียนออนไลน์ — ใช้ชุดดีไซน์และสถาปัตยกรรมเดียวกับ NP-TCAS Verified
(แยกไฟล์ตามหน้า ใช้ Firebase Auth (Google) + Firestore ใช้เมนู/สไตล์ร่วมกันผ่านโฟลเดอร์ `shared/`)

## บทบาทผู้ใช้ (roles)

ผู้ใช้ทุกคนมี role `user` โดยอัตโนมัติเมื่อล็อกอินครั้งแรก และสามารถมี role เพิ่มได้พร้อมกันหลายอัน:

| role | ใครได้ | เข้าเมนูอะไร |
|---|---|---|
| `user` | ทุกคนที่ล็อกอิน | หน้าแรก, ข้อมูลส่วนตัว, การอบรมของฉัน, หลักสูตรการอบรมทั้งหมด |
| `instructor` | ผู้ใช้ที่ถูกมอบสิทธิ์จากเจ้าหน้าที่ | หลักสูตรที่เป็นเจ้าของ, หลักสูตรการอบรม (จัดการ/สร้าง) |
| `staff` | ผู้ใช้ที่ถูกมอบสิทธิ์จากเจ้าหน้าที่ หรือ super admin | แดชบอร์ดระบบ, หลักสูตรการอบรม (จัดการทั้งหมด), ผู้ใช้งาน |

**Super admin เริ่มต้น:** `nattapol@nongki.ac.th` — ได้สิทธิ์ `staff` อัตโนมัติเสมอ (hardcode ไว้ที่
`shared/firebase-init.js` ตัวแปร `SUPER_ADMIN_EMAIL` และใน `firestore.rules`) ใช้เพื่อเข้าไปมอบสิทธิ์
ให้ผู้ใช้คนอื่นต่อในหน้า `admin-users.html` โดยไม่ต้องสร้างเอกสารแรกมือใน Console

ผู้ใช้ที่มีมากกว่า 1 role จะเห็นแถบสลับกลุ่มเมนู ("role-switch") ที่ใต้ navbar ของทุกหน้า

## หน้าทั้งหมด (แยกไฟล์ตามหน้า)

| ไฟล์ | กลุ่มเมนู | ทำอะไร |
|---|---|---|
| `index.html` | ทุกคน | ล็อกอิน Google แล้วพาไปหน้า onboarding หรือ dashboard อัตโนมัติ |
| `onboarding.html` | ทุกคน (ล็อกอินครั้งแรก) | กรอกข้อมูลส่วนตัวก่อนเริ่มใช้งาน |
| `dashboard.html` | user | แดชบอร์ดผู้ใช้ทั่วไป — สรุปหลักสูตรที่สมัคร/เรียนจบ/กำลังเรียน |
| `profile.html` | user | แก้ไขข้อมูลส่วนตัว |
| `my-courses.html` | user | รายการหลักสูตรที่สมัคร พร้อมความคืบหน้า และลิงก์เกียรติบัตร (เมื่อเรียนจบ) |
| `courses.html` | user | เรียกดู/สมัครหลักสูตรที่เปิดรับสมัครทั้งหมด |
| `instructor-courses.html` | instructor | รายการหลักสูตรที่ตัวเองเป็นเจ้าของ |
| `course-manage.html` | instructor | สร้าง/แก้ไขข้อมูลพื้นฐานของหลักสูตร (รายละเอียดบทเรียนเพิ่มภายหลัง) |
| `admin-dashboard.html` | staff | แดชบอร์ดภาพรวมทั้งระบบ |
| `admin-courses.html` | staff | จัดการ/เปลี่ยนสถานะหลักสูตรทั้งหมดในระบบ |
| `admin-users.html` | staff | ค้นหาผู้ใช้งานทั้งหมด และมอบสิทธิ์ instructor/staff |

ทุกหน้าโหลด `shared/firebase-init.js` + `shared/auth-guard.js` + `shared/menu.js` เหมือนกัน แล้วเรียก
`guardPage(['role ที่อนุญาต'], callback)` เพื่อเช็คสิทธิ์ก่อนแสดงเนื้อหา จากนั้นเรียก
`renderShell(group, activeHref, profile)` เพื่อวาด sidebar + role-switch จากไฟล์เมนูกลางเดียว
(`shared/menu.js`) — แก้เมนูที่ไฟล์นี้ที่เดียว มีผลทุกหน้า

## โครงสร้างข้อมูล (Firestore)

```
users/{uid}          → { name, email, phone, organization, position,
                          photoURL, roles: ['user'|'instructor'|'staff', ...],
                          onboarded: boolean, createdAt }
courses/{id}          → { title, description, category, status: 'draft'|'published',
                          ownerUid, ownerName, createdAt, updatedAt }
enrollments/{uid_courseId} → { uid, courseId, courseTitle, status: 'in_progress'|'completed',
                          progress: 0-100, certificateUrl?, enrolledAt, completedAt? }
```

> เกียรติบัตร (`certificateUrl`) ยังเป็นฟิลด์เปล่าไว้ก่อน — เดี๋ยวเพิ่มระบบออกเกียรติบัตรอัตโนมัติเมื่อ
> `progress` ถึง 100% ในเวอร์ชันถัดไปตามที่ตกลงไว้

## ขั้นตอนติดตั้ง

1. สร้างโปรเจกต์ Firebase ใหม่ที่ https://console.firebase.google.com
2. เปิดใช้ **Authentication → Sign-in method → Google**
3. เปิดใช้ **Firestore Database** (โหมด production)
4. คัดลอกค่า config จาก Project settings → General → Your apps → Web app มาใส่ใน
   `shared/firebase-init.js` แทนค่า `YOUR_...`
5. Deploy security rules: Firestore Database → แท็บ Rules → วางเนื้อหาจาก `firestore.rules` → Publish
   (หรือใช้ `firebase deploy --only firestore:rules` ถ้าติดตั้ง Firebase CLI)
6. ล็อกอินด้วยอีเมล `nattapol@nongki.ac.th` ครั้งแรก — จะได้สิทธิ์ staff อัตโนมัติ ใช้เข้า
   `admin-users.html` เพื่อมอบสิทธิ์ instructor/staff ให้คนอื่นต่อได้เลย
7. โฮสต์ไฟล์ทั้งหมดด้วย Firebase Hosting / GitHub Pages หรือ static host ใดก็ได้ แล้วเพิ่มโดเมนนั้นใน
   Authentication → Settings → Authorized domains ไม่งั้น popup ล็อกอินจะ error

## จุดที่ควรต่อยอด

- **course-manage.html** ตอนนี้บันทึกแค่ข้อมูลพื้นฐานหลักสูตร (ชื่อ/คำอธิบาย/หมวดหมู่/สถานะ) — ยังไม่มี
  ระบบจัดการบทเรียน/เนื้อหา/แบบทดสอบภายในหลักสูตร ตามที่ตกลงว่าจะใส่รายละเอียดทีหลัง
- **เกียรติบัตร**: ยังไม่มีระบบออกเกียรติบัตรอัตโนมัติ ต้องเพิ่ม logic อัปเดต `certificateUrl` เมื่อ
  `progress` = 100 (คล้ายรูปแบบอัปโหลดไฟล์ผ่าน Cloud Function ของโปรเจกต์ NP-TCAS Verified)
- **ความคืบหน้า (progress)**: ตอนนี้ยังไม่มีหน้าเรียนจริงที่อัปเดตค่า progress — เป็นฟิลด์ตัวเลขเปล่าไว้ก่อน
  รอออกแบบหน้าคอร์สเพลเยอร์/บทเรียนในเวอร์ชันถัดไป
