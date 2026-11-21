# Gia phả họ Chu

Ứng dụng web quản lý gia phả dòng họ. Bản này **chạy trực tiếp trên Google** (Google Apps Script), toàn bộ dữ liệu, ảnh, tài liệu và bản sao lưu nằm trong **Google Drive** của tài khoản quản trị. Không cần GitHub Pages hay máy chủ riêng.

## Tổng hợp các repo

| Repo | Nội dung | Ghi chú |
|---|---|---|
| `Giaphahochu.hy` (repo này) | Bản đầy đủ, mới nhất: giao diện + máy chủ `Code.gs` + bản chạy trên Google (`apps-script/`) | **Dùng repo này** |
| `GiaPha_HO_CHU` | Giao diện giống hệt bản cũ của repo này (trước khi gộp), không có `Code.gs` | Trùng lặp |
| `giapha.ho.chu` | Giao diện phiên bản cũ hơn (nhỏ hơn ~20 KB, thiếu một số tính năng mới) | Cũ |
| `GP_Chitoc_Ho_Chu` | Trống | — |

Trước đây `Code.gs` trong repo cũ hơn bản máy chủ mà trình cài đặt trong app tải về (thiếu Quỹ họ, Thành tích, khung ảnh, hoàn tác…). Nay `Code.gs` là bản mới nhất và được nhúng lại vào app bằng `tools/build-gas.js`, hai nơi luôn khớp nhau.

## Tính năng

- Danh sách, **cây gia phả**, tìm kiếm không dấu, xưng hô, trang hộ gia đình
- **Lịch âm dương**, sự kiện sắp tới, email **nhắc giỗ và sinh nhật** mỗi sáng
- Album ảnh, tài liệu đính kèm (PDF, ảnh, ghi âm, video ≤ 8 MB) lưu trong Drive
- **Quỹ họ, quỹ khuyến học, bảng thành tích**, thống kê và dòng thời gian
- Phân quyền: Quản trị viên / Thành viên gửi đề xuất / Chỉ xem; duyệt đề xuất, nhật ký sửa đổi, hoàn tác
- Ẩn thông tin liên hệ với người không được cấp quyền (máy chủ cắt bỏ trước khi gửi)
- **Liên kết chia sẻ một nhánh** cho người ngoài xem, không cần đăng nhập
- Sao lưu tự động mỗi ngày vào thư mục `giapha-saoluu` (giữ 30 bản), khôi phục một chạm
- Xuất/nhập Excel, in ấn, giao diện sáng/tối

## Cài đặt: chạy trực tiếp trên Google Drive

Cần làm **một lần**, bằng tài khoản Google sẽ chứa dữ liệu (tài khoản chủ).

### 1. Tạo OAuth Client ID (để thành viên đăng nhập bằng Google)
1. Vào <https://console.cloud.google.com/> → tạo dự án mới.
2. **APIs & Services → OAuth consent screen**: chọn *External*, điền tên app, email, lưu. Bấm *Publish app* (để ai có tài khoản Google cũng đăng nhập được).
3. **Credentials → Create credentials → OAuth client ID** → loại *Web application*. Chưa cần điền gì thêm, bấm *Create* và sao chép **Client ID** (dạng `123…-abc.apps.googleusercontent.com`).

### 2. Tạo dự án Apps Script
1. Vào <https://script.google.com/> → **Dự án mới**.
2. Mở `Code.gs`, xoá hết, dán toàn bộ [`apps-script/Code.gs`](apps-script/Code.gs). Sửa dòng `CLIENT_ID = '…'` thành Client ID ở bước 1.
3. **Tệp → + → HTML**, đặt tên đúng là `Index`, xoá nội dung mẫu, dán toàn bộ [`apps-script/Index.html`](apps-script/Index.html).
4. Lưu.

### 3. Triển khai
1. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**.
2. *Thực thi với tư cách*: **Tôi**. *Người có quyền truy cập*: **Bất kỳ ai**.
3. Bấm *Triển khai*, cấp quyền (Drive, gửi email, gọi dịch vụ ngoài), sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

### 4. Cho phép đăng nhập từ app
1. Mở URL `/exec` vừa có. Ở màn hình *Đăng nhập*, mở mục **“Nút đăng nhập không hiện hoặc báo lỗi?”** và sao chép địa chỉ hiển thị (dạng `https://n-…-script.googleusercontent.com`).
2. Quay lại Google Cloud Console → Credentials → Client ID ở bước 1 → **Authorized JavaScript origins** → thêm địa chỉ đó → *Save*. Đợi vài phút rồi tải lại trang.
3. Đăng nhập bằng tài khoản chủ: bạn là quản trị viên. Trình cài đặt trong app sẽ hướng dẫn các bước còn lại (thông tin dòng họ, mời thành viên, nhắc giỗ, sao lưu).

### 5. Dùng hằng ngày
- Gửi **URL `/exec`** cho thành viên, sau đó thêm email của họ trong tab **Quản trị**.
- Nhắc giỗ hằng ngày: trong trình soạn Apps Script chọn hàm `setupReminders` → *Chạy* một lần.
- Dữ liệu trong Drive của tài khoản chủ: `giapha-data.json`, thư mục `giapha-anh`, `giapha-tailieu`, `giapha-saoluu`.

### Cập nhật phiên bản mới
Dán lại `Code.gs` (giữ dòng `CLIENT_ID`) và `Index.html`, rồi **Triển khai → Quản lý triển khai → biểu tượng bút → Phiên bản: Phiên bản mới → Triển khai**. URL `/exec` giữ nguyên, dữ liệu không mất.

Người dùng `clasp` có thể đẩy cả thư mục `apps-script/` (đã kèm `appsscript.json`): `clasp create --type webapp --rootDir apps-script` rồi `clasp push`.

## Vẫn dùng được trên GitHub Pages
`index.html` ở thư mục gốc là cùng một mã: mở trên GitHub Pages thì app tự dùng chế độ cũ (nhập địa chỉ `/exec` và Client ID trong trình cài đặt, gọi máy chủ bằng `fetch`). Khi được Apps Script phục vụ, `Code.gs` chèn sẵn cấu hình nên app tự kết nối, gọi máy chủ qua `google.script.run`, không cần cấu hình gì.

## Dành cho người phát triển
Sửa `index.html` hoặc `Code.gs` ở thư mục gốc, rồi chạy:

```bash
node tools/build-gas.js
```

Lệnh này nhúng `Code.gs` vào `index.html` (cho trình cài đặt) và tạo lại `apps-script/Code.gs`, `apps-script/Index.html`.

## Lưu ý
- Trong chế độ chạy trên Google, app không cài được thành ứng dụng ngoại tuyến (PWA) như bản GitHub Pages; vẫn thêm được lối tắt vào màn hình chính từ trình duyệt.
- Mọi quyền được kiểm tra ở `Code.gs` bằng mã đăng nhập Google của người dùng: người lạ biết URL cũng không đọc hay sửa được dữ liệu.
