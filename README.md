# NICHE PERFUMES

متجر ديودرنت عربي (RTL)، موبايل أولاً، مع وضع ليلي. مبني بـ HTML + CSS + JavaScript عادي، بدون framework وبدون build، ويعمل على Firebase (Hosting + Firestore + Auth + Storage).

```
public/
  index.html          واجهة الزبون (روابط: #/  #/p/ID  #/checkout  #/order/NP-1042)
  admin/index.html    لوحة الأدمن  (/admin)
  css/                base.css (الألوان والخطوط والوضع الليلي) + store.css + admin.css
  js/config.js        ← هنا تحط إعدادات Firebase مالتك
  js/firebase.js      تحميل Firebase من CDN
  js/shared.js        المحافظات، تنسيق الرقم العراقي، رسمة العلبة SVG، الشعار
  js/store.js         المتجر: المنتجات، السلة، إتمام الطلب (transaction)
  js/admin.js         اللوحة: الطلبات، المنتجات، البنرات، التوصيل، الإعدادات
firestore.rules       قواعد الأمان + التحقق من الطلبات
storage.rules         رفع الصور للأدمن فقط
tests/                اختبارات القواعد (36 اختبار)
```

## خطوات التشغيل

1. **إنشاء المشروع:** افتح [console.firebase.google.com](https://console.firebase.google.com) ← Add project ← سمّه مثلاً `niche-perfumes`.
2. **إضافة تطبيق ويب:** من صفحة المشروع اضغط أيقونة `</>` ← سجّل التطبيق ← انسخ كائن `firebaseConfig` وحطه بدل القيم الموجودة في `public/js/config.js`.
3. **تفعيل الدخول:** Build ← Authentication ← Get started ← Sign-in method ← فعّل **Email/Password**.
   بعدها تبويب Users ← Add user ← اكتب إيميلك وباسورد قوي ← انسخ الـ **User UID**.
4. **تفعيل Firestore:** Build ← Firestore Database ← Create database ← اختر **production mode** والموقع `eur3` (أو `me-central1`).
5. **إضافة نفسك كأدمن:** بـ Firestore ← Start collection ← اسمها `admins` ← Document ID = الـ UID اللي نسخته ← أضف حقل `email` (string) بإيميلك ← Save.
6. **تفعيل Storage:** Build ← Storage ← Get started.
   ملاحظة: Firebase صار يطلب خطة **Blaze** لتفعيل Storage بالمشاريع الجديدة. تبقى مجانية ضمن الحدود المجانية؛ اختر موقع `us-central1` للبكت حتى تستفاد من الحد المجاني، وحط تنبيه ميزانية (Budget alert) بمبلغ صغير من Google Cloud Billing.
7. **الرفع على Hosting:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # اختر مشروعك، وسمّه default
   firebase deploy             # يرفع الموقع + قواعد Firestore + قواعد Storage
   ```
   أول مرة يسألك عن صلاحية Storage تقرأ Firestore (حتى يتحقق من الأدمن) ← وافق.
8. **التجهيز من اللوحة:** افتح `https://<project-id>.web.app/admin` وسجّل دخول:
   - المنتجات ← **إضافة البيانات الأولية** (E02 و T15) ← عدّل كل منتج وحدد السعر والكمية و"بديل عن".
   - أجور التوصيل ← راجع سعر كل محافظة (مملوءة مبدئياً: بغداد 5,000 والباقي 7,000).
   - الإعدادات ← رقم واتساب المتجر وانستغرام ونص الشريط العلوي.
   - البنرات ← ارفع صورة (1920×1080). لحد ما ترفع، يظهر البنر الافتراضي بالأسود والأبيض.

## كيف يشتغل الأمان

- المنتجات والبنرات والإعدادات: قراءة للكل، كتابة للأدمن فقط (UID موجود بـ `admins`).
- الطلبات: الزائر يقدر **ينشئ** فقط. القراءة والتعديل والحذف للأدمن فقط.
- الطلب ينحفظ بـ transaction واحدة تقرأ الأسعار والمخزون من Firestore (مو من السلة)، تنقص المخزون، وتاخذ رقم تسلسلي (NP-1042، NP-1043…).
- القواعد نفسها تتحقق من كل طلب: الاسم والرقم العراقي `+9647XXXXXXXXX` والمحافظة والعنوان، سعر كل منتج يساوي سعره الحالي، المجموع والإجمالي صحيح، أجور التوصيل تطابق الإعدادات، المخزون نقص بنفس الكمية بالضبط، ورقم الطلب هو التالي بالتسلسل. أي طلب مزوّر ينرفض.
- **حد الطلب:** 5 منتجات مختلفة × 10 قطع لكل منتج. هذا حد مقصود: Firestore يسمح بعدد محدود من العمليات داخل القواعد لكل طلب، و5 هو الحد اللي يخلي كل التحققات شغالة.
- إلغاء الطلب من اللوحة يرجّع الكميات للمخزن.

## التطوير المحلي (اختياري)

طالما `projectId` بـ `config.js` يبدأ بـ `demo-`، الموقع يتصل بالـ emulators المحلية بدل Firebase الحقيقي:

```bash
firebase emulators:start --project demo-niche
# المتجر: http://localhost:5000   اللوحة: http://localhost:5000/admin/
```

اختبارات القواعد:

```bash
cd tests && npm install && npm test
```
