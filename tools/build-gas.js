// Đồng bộ mã máy chủ và tạo bản chạy trực tiếp trên Google Apps Script.
//   node tools/build-gas.js
// 1) Nhúng Code.gs mới nhất vào index.html (biến GS_SRC, trình cài đặt dùng để tải về)
// 2) Tạo apps-script/Code.gs và apps-script/Index.html để dán (hoặc đẩy bằng clasp) vào dự án Apps Script
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const gs = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const re = /\/\*GS_SRC_BEGIN\*\/const GS_SRC="(?:[^"\\]|\\.)*"/;
if (!re.test(html)) throw new Error('Không thấy GS_SRC trong index.html');
html = html.replace(re, () => '/*GS_SRC_BEGIN*/const GS_SRC=' + JSON.stringify(gs).replace(/<\/script/gi, '<\\/script'));
if (html.split('/*GAS_CFG*/null').length < 2) throw new Error('Thiếu chỗ chèn cấu hình /*GAS_CFG*/null');
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.mkdirSync(path.join(root, 'apps-script'), { recursive: true });
fs.writeFileSync(path.join(root, 'apps-script', 'Code.gs'), gs);
fs.writeFileSync(path.join(root, 'apps-script', 'Index.html'), html);
console.log('Đã tạo apps-script/Code.gs (' + gs.length + ' ký tự) và apps-script/Index.html (' + html.length + ' ký tự)');
