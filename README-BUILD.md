# ChatZone - Capacitor Android Project

## المتطلبات قبل البناء
1. Node.js (موجود عندك أصلاً)
2. Android Studio (بيجيب معاه SDK تلقائيًا) أو Android SDK + Gradle لوحده

## خطوات البناء

```bash
# 1. فك الضغط وادخل المجلد
cd ChatZone

# 2. ثبّت الباكدجات
npm install

# 3. (اختياري) لو عايز تعدل أي حاجة في الويب، عدّل في مجلد www/ ثم:
npx cap sync android

# 4. ابني الـ APK
cd android
./gradlew assembleDebug

# الـ APK هيطلع في:
# android/app/build/outputs/apk/debug/app-debug.apk
```

## أو الأسهل: افتحه في Android Studio مباشرة
```bash
npx cap open android
```
وسيبه Android Studio يعمل Sync وبعدها Build > Build APK(s).

## معلومات المشروع
- **appId**: com.mamods.chatzone
- **appName**: ChatZone
- **الويب موجود في**: www/ (منسوخ من ريبو chatzonex/ar)
- Firebase شغال بنفس الإعدادات الأصلية (نفس المشروع chatzone-b296a)
- صلاحية الإنترنت مضافة تلقائيًا في AndroidManifest

## ملاحظات
- التطبيق بيستخدم Firebase JS SDK عن طريق CDN (gstatic.com) — لازم يفضل عنده اتصال إنترنت وقت أول تشغيل عشان يحمّل السكريبتات، وبعدين الـ WebView بيكاش الداتا محليًا حسب إعدادات Firestore الموجودة في firebase-init.js.
- التوقيع (Signing) للـ Release APK لسه محتاج تعمله بنفسك (keystore خاص بيك) قبل ما تنشره على Google Play.
