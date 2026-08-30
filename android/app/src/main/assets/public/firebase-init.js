// firebase-init.js
// ملف موحّد لتهيئة Firebase (يتستخدم في كل صفحات المشروع)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  enableNetwork,
  disableNetwork,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFgxjZgoaP7Q7vSUjXOJvM1-UIRYIEsyk",
  authDomain: "chatzone-b296a.firebaseapp.com",
  projectId: "chatzone-b296a",
  storageBucket: "chatzone-b296a.firebasestorage.app",
  messagingSenderId: "157945849107",
  appId: "1:157945849107:web:e1aa8f36f1bca9a7ab66e6",
  measurementId: "G-DYPL4KPMXX"
};

const app = initializeApp(firebaseConfig);

// الـ Analytics ممكن يفشل لو الموقع شغال محليًا (localhost/file)، فبنحميه
try {
  getAnalytics(app);
} catch (e) {
  console.warn("Analytics غير متاح في البيئة الحالية:", e);
}

// =====================================================
// تفعيل التخزين المحلي (Offline Persistence) — بيخزن كل
// الداتا (شاتات، رسايل، إلخ) في IndexedDB جوه المتصفح نفسه.
// الفايدة: أول ما المستخدم يفتح الشات، الرسايل القديمة بتظهر
// فورًا من الكاش المحلي من غير ما يستنى رد من السيرفر، وحتى
// لو النت واقع تمامًا الرسايل الجديدة بتتبعت (تتخزن محليًا
// كـ"pending" وتتبعت تلقائيًا أول ما النت يرجع من غير أي كود
// إضافي — ده سلوك Firestore الافتراضي). persistentMultipleTabManager
// بيخلي الكاش شغال صح حتى لو المستخدم فاتح أكتر من تاب لنفس الموقع.
// لو المتصفح مش بيدعم IndexedDB (نادر جدًا)، بنرجع لـ Firestore
// عادي أونلاين-بس من غير ما نوقف الموقع كله.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn("تعذّر تفعيل التخزين المحلي (IndexedDB)، هنكمل أونلاين بس:", e);
  db = initializeFirestore(app, {});
}

const auth = getAuth(app);

/**
 * بيرجع Promise بحالة تسجيل الدخول الحالية في Firebase Auth (أول مرة بس،
 * بعدين بيقفل نفسه). لازم يتستنى قبل أي قراءة/كتابة في Firestore محمية
 * بقاعدة "request.auth != null".
 */
function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * بيتأكد إن فيه مستخدم مسجل دخول (anonymous) في Firebase Auth، ولو مفيش
 * بيعمل signInAnonymously تلقائيًا. ده بيوفر request.auth.uid حقيقي
 * تقدر Firestore Rules تعتمد عليه بدل قاعدة "allow read, write: if true".
 *
 * ملحوظة مهمة: ده بيقفل ثغرة "أي حد يقرا/يمسح الداتا بيز من غير أي
 * تسجيل دخول أصلاً"، لكنه لسه مش بديل كامل عن تحقق سيرفري حقيقي من
 * ملكية الإيميل (ده محتاج Cloud Function + Custom Token).
 */
async function ensureAuthenticated() {
  const existing = await waitForAuthUser();
  if (existing) return existing;
  const result = await signInAnonymously(auth);
  return result.user;
}

/**
 * تسجيل دخول الأدمن بإيميل وباسورد حقيقيين (مش anonymous). مستخدمة
 * بس في صفحة system.html. لازم تفعيل "Email/Password" من
 * Firebase Console -> Authentication -> Sign-in method، وإنشاء
 * حساب الأدمن (إيميل + باسورد) يدويًا من هناك مرة واحدة.
 */
async function signInAdmin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export {
  db,
  auth,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  enableNetwork,
  disableNetwork,
  writeBatch,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  waitForAuthUser,
  ensureAuthenticated,
  signInAdmin
};
