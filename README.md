# Quản lý kênh YouTube (youtube-channel-manager)

Dashboard riêng để theo dõi nhiều kênh YouTube ở một nơi: kênh của bạn (đăng nhập bằng từng tài khoản Google) và kênh của người khác để tham khảo. Đây là web app tĩnh, không có máy chủ; dữ liệu lưu trên trình duyệt của bạn.

## Tính năng

- **Nhiều tài khoản Google**: mỗi kênh đăng nhập một lần bằng tài khoản quản lý kênh đó. Ứng dụng chỉ xin quyền xem.
- **Tổng quan**: người đăng ký, lượt xem, số video của mọi kênh, thay đổi trong 1/7/30/90 ngày, tổng 28 ngày của các kênh đã đăng nhập.
- **Số liệu riêng của kênh** (YouTube Analytics, kỳ 7/28/90 ngày, so với kỳ trước): lượt xem, thời gian xem, thời lượng xem trung bình, người đăng ký tăng/giảm, thích, bình luận, chia sẻ, nguồn truy cập, quốc gia, thiết bị, video nhiều lượt xem nhất. Doanh thu ước tính là tùy chọn.
- **Kênh tham khảo**: thêm bằng link kênh, `@handle`, ID kênh hoặc link một video. Xem video gần đây, lượt xem trung bình/trung vị, tỉ lệ tương tác, tần suất và thói quen đăng, video nổi bật so với mức chung của kênh.
- **So sánh** các kênh theo 8 chỉ số, trang **Video** gom video gần đây của mọi kênh.
- **Lịch sử tăng trưởng**: ứng dụng tự lưu một điểm mỗi ngày bạn làm mới, vì YouTube không cung cấp lịch sử của kênh công khai.
- Ghi chú riêng cho từng kênh, xuất/nhập sao lưu JSON, xuất bảng CSV, dữ liệu mẫu để xem thử.

## Thiết lập một lần (khoảng 10 phút)

1. Mở [Google Cloud Console](https://console.cloud.google.com/) và tạo một dự án.
2. "APIs & Services" → "Library": bật **YouTube Data API v3** và **YouTube Analytics API**.
3. "OAuth consent screen": loại **External**; ở "Test users" thêm mọi email Google bạn dùng để quản lý các kênh.
4. "Credentials" → "Create credentials" → "OAuth client ID" → **Web application**. Ở "Authorized JavaScript origins" thêm địa chỉ bạn mở ứng dụng, ví dụ `https://thanhhaikia.github.io` và `http://localhost:8080`.
5. "Credentials" → "Create credentials" → "API key". Nên giới hạn key cho "YouTube Data API v3" và cho địa chỉ trang của bạn.
6. Mở ứng dụng → **Cài đặt**, dán Client ID và API key. Không cần Client secret.
7. Về **Tổng quan**, bấm "Đăng nhập Google để thêm kênh". Lặp lại cho từng tài khoản/kênh.

Lần đầu Google báo "ứng dụng chưa được xác minh": chọn "Advanced" → "Go to …" (đây là ứng dụng của chính bạn) và tick đủ các ô quyền.

## Cách chạy

- **GitHub Pages**: Settings → Pages → Source = "GitHub Actions". Mỗi lần gộp vào `main`, workflow tự kiểm thử và phát hành.
- **Trên máy**: cần Node.js 20 trở lên, chạy `npm start` rồi mở http://localhost:8080.
- **Mở trực tiếp `index.html`**: xem được dữ liệu mẫu và dùng được API key, nhưng không đăng nhập Google được (Google yêu cầu địa chỉ http/https).

## Ứng dụng Android (APK)

Thư mục `android/` là một ứng dụng WebView đóng gói chính web app này. Google không cho đăng nhập trong WebView, nên ứng dụng đăng nhập bằng Google Play Services (`NativeBridge.java`) và tự gia hạn phiên khi làm mới.

- Build: `cd android && ./gradlew assembleRelease` (JDK 17, Android SDK 34). APK nằm ở `android/app/build/outputs/apk/release/`.
- Ký APK: tạo `android/keystore.properties` (không đưa vào git) với `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. Không có tệp này thì dùng `./gradlew assembleDebug`.
- Thiết lập Google Cloud: tạo thêm một "OAuth client ID" loại **Android** với package name `io.github.thanhhaikia.youtubemanager` và mã SHA-1 của chứng chỉ ký APK. Trang Cài đặt trong ứng dụng hiển thị sẵn hai giá trị này. Đổi khóa ký thì SHA-1 đổi theo và phải khai báo lại.
- Trong APK, mỗi tài khoản Google chỉ mở được kênh chính của tài khoản đó; kênh thuộc tài khoản thương hiệu (Brand Account) cần đăng nhập ở bản web.
- Nếu giới hạn API key theo trang web, thêm `https://appassets.androidplatform.net/*`, hoặc chỉ giới hạn theo API.

## Giới hạn cần biết

- Mỗi phiên đăng nhập Google kéo dài khoảng 1 giờ (quy định của Google với ứng dụng chạy hoàn toàn trên trình duyệt). Hết phiên, số liệu công khai vẫn cập nhật bằng API key; số liệu riêng cần bấm "Kết nối lại". Nếu cho phép pop-up cho trang, nút "Kết nối lại tất cả" làm lần lượt mọi kênh.
- Khi dự án Google Cloud ở chế độ "Testing", chỉ các email trong "Test users" đăng nhập được.
- Ứng dụng chỉ đọc số liệu, không đăng video, không sửa tiêu đề hay trả lời bình luận.
- Dữ liệu nằm trên một trình duyệt. Muốn dùng trên máy khác, hãy xuất tệp sao lưu rồi nhập lại.
- Mỗi kênh tải tối đa 50 video gần nhất. Hạn mức miễn phí của YouTube Data API là 10.000 đơn vị/ngày; một lần làm mới tốn khoảng 2 đơn vị mỗi kênh.
- Số liệu YouTube Analytics thường chậm 2–3 ngày.

## Bảo mật

- API key và Client ID chỉ lưu trong `localStorage` của trình duyệt; mã đăng nhập Google chỉ lưu trong `sessionStorage` và mất khi đóng tab.
- Tệp sao lưu không chứa API key, Client ID hay mã đăng nhập.
- Ứng dụng chỉ gửi yêu cầu tới `googleapis.com` và `accounts.google.com` (được khóa bằng Content-Security-Policy).

## Cấu trúc mã

| Tệp | Vai trò |
| --- | --- |
| `index.html`, `css/style.css` | Khung trang và giao diện |
| `js/api.js` | Gọi YouTube Data API v3 và YouTube Analytics API v2 |
| `js/auth.js` | Đăng nhập Google (Google Identity Services, token model) |
| `js/store.js` | Lưu trữ, sao lưu, hạn mức |
| `js/metrics.js` | Tính toán và định dạng số liệu |
| `js/charts.js`, `js/views.js`, `js/app.js` | Biểu đồ, giao diện, xử lý sự kiện |
| `js/demo.js` | Dữ liệu mẫu |
| `android/` | Ứng dụng Android (WebView + đăng nhập Google qua Play Services) |
| `tests/` | Kiểm thử đơn vị (`npm test`) |
