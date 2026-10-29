/**
 * BEST SALON REPORT 無料オンラインセミナー（2026年11月）申し込み受付
 *
 * 使い方：Apps Script のプロジェクトにこのファイルの中身を貼り付け、
 * 「プロジェクトの設定 → スクリプト プロパティ」に次の2つを登録して使います。
 *   ZOOM_URL        ZoomウェビナーのURL（両日共通）
 *   SPREADSHEET_ID  申し込みを保存するスプレッドシートのID
 * 手順は README.md を参照してください。
 */

// ===== 差し替える値（ZoomのURL・スプレッドシートIDはスクリプト プロパティに入れる） =====
var CONFIG = {
  // 送信元アドレス。空欄のときは、このスクリプトを持つアカウント（s.mori@pccinc.jp）から送ります。
  // 別のアドレスから送る場合は、そのアドレスをGmailの「送信元（エイリアス）」に登録してから入力してください。
  FROM_ADDRESS: 'info@pccinc.jp',
  // メールの差出人名
  SENDER_NAME: 'BEST SALON REPORT',
  // 返信先（申込者がメールに返信したときの宛先）
  REPLY_TO: 'info@pccinc.jp',
  // 申し込みがあったことを知らせる社内向けメールの宛先
  NOTIFY_TO: 'support@pccinc.jp',
  // 申込締切（この時刻になったら受付終了。日本時間）
  DEADLINE: '2026-11-12T19:00:00+09:00',
  // 保存先のシート名
  SHEET_NAME: '申し込み'
};
// =================================

var DATES = {
  '2026-11-11': '11月11日（水）19:00〜',
  '2026-11-12': '11月12日（木）19:00〜'
};

var DATE_LABELS_MAIL = {
  '2026-11-11': '2026年11月11日（水）19:00〜',
  '2026-11-12': '2026年11月12日（木）19:00〜'
};

var HEADERS = [
  '申込日時', '参加希望日', 'お名前', 'サロン名', '役職', 'メールアドレス', '携帯電話番号', '当日聞きたいこと',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  '当日参加', 'アンケート回答', '資料送付済み'
];

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var PHONE_RE = /^0[6789]0-?\d{4}-?\d{4}$/;

/** 最初に一度だけ実行：シートと見出し行を用意する */
function setupSheet() {
  var sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
}

/** 自動返信メールの文面を確認する（自分宛てにテスト送信） */
function sendTestMail() {
  getProps_();
  sendReply_({
    name: 'テスト',
    date: '2026-11-11',
    email: Session.getActiveUser().getEmail()
  });
}

/** 社内向けの申し込み通知を確認する（NOTIFY_TO 宛てにテスト送信） */
function sendTestNotify() {
  sendNotify_({
    submissionId: 'テスト',
    receivedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
    date: '2026-11-11',
    name: 'テスト',
    salon: 'テストサロン',
    position: '',
    email: Session.getActiveUser().getEmail(),
    phone: '000-0000-0000',
    question: '',
    utm: { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '' }
  });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  if (new Date().getTime() >= new Date(CONFIG.DEADLINE).getTime()) {
    return json_({ ok: false, error: 'closed' });
  }

  // 人には見えない項目に入力がある＝自動送信
  if (data.website) {
    return json_({ ok: false, error: 'bad_request' });
  }

  // 設定が足りないときは、保存もメールもしない
  try {
    getProps_();
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }

  var d = normalize_(data);
  var fields = validate_(d);
  if (Object.keys(fields).length) {
    return json_({ ok: false, error: 'invalid', fields: fields });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    // 同じ申し込みが二重に届いた場合は、保存もメールもせずに成功を返す
    var cache = CacheService.getScriptCache();
    var cacheKey = 'sub_' + d.submissionId;
    if (d.submissionId && cache.get(cacheKey)) {
      return json_({ ok: true });
    }

    d.receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    var sheet = getSheet_();
    if (sheet.getLastRow() === 0) setupSheet();
    sheet.appendRow([
      d.receivedAt, DATES[d.date], d.name, d.salon, d.position, d.email, d.phone, d.question,
      d.utm.utm_source, d.utm.utm_medium, d.utm.utm_campaign, d.utm.utm_content,
      '', '', ''
    ].map(safeCell_));
    SpreadsheetApp.flush();

    if (d.submissionId) cache.put(cacheKey, '1', 21600);
  } catch (err) {
    console.error('保存に失敗しました', err);
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }

  // 保存は成功しているので、メールの失敗では申し込みを失敗扱いにしない（実行ログで確認する）
  try {
    sendReply_(d);
  } catch (err) {
    console.error('自動返信メールの送信に失敗しました: ' + d.email, err);
  }
  try {
    sendNotify_(d);
  } catch (err) {
    console.error('申し込み通知メールの送信に失敗しました', err);
  }

  return json_({ ok: true });
}

function normalize_(data) {
  var utm = data.utm || {};
  return {
    submissionId: str_(data.submissionId, 100),
    date: str_(data.date, 20),
    name: str_(data.name, 50),
    salon: str_(data.salon, 100),
    position: str_(data.position, 50),
    email: toHalf_(str_(data.email, 254)),
    phone: toHalf_(str_(data.phone, 20)),
    question: str_(data.question, 1000),
    agree: data.agree === true,
    utm: {
      utm_source: str_(utm.utm_source, 200),
      utm_medium: str_(utm.utm_medium, 200),
      utm_campaign: str_(utm.utm_campaign, 200),
      utm_content: str_(utm.utm_content, 200)
    }
  };
}

function validate_(d) {
  var f = {};
  if (!DATES[d.date]) f.date = '参加希望日を選択してください';
  if (!d.name) f.name = 'お名前を入力してください';
  if (!d.salon) f.salon = 'サロン名を入力してください';
  if (!EMAIL_RE.test(d.email)) f.email = 'メールアドレスの形式が正しくありません';
  if (!PHONE_RE.test(d.phone)) f.phone = '携帯電話番号の形式が正しくありません（例：090-1234-5678）';
  if (!d.agree) f.agree = 'プライバシーポリシーへの同意が必要です';
  return f;
}

function sendReply_(d) {
  var subject = '【BEST SALON REPORT】無料オンラインセミナーのお申し込みありがとうございます';
  var body = [
    d.name + ' 様',
    '',
    'このたびは、BEST SALON REPORT 無料オンラインセミナーにお申し込みいただき、ありがとうございます。',
    '以下の内容でお申し込みを受け付けました。',
    '',
    '■セミナー名',
    'AIに、あなたのサロンはどう紹介されていますか？',
    '〜強みを言葉にして、AIに選ばれる美容室になる方法〜',
    '',
    '■参加希望日',
    DATE_LABELS_MAIL[d.date],
    '',
    '■参加URL（Zoom）',
    getProps_().zoomUrl,
    '※両日とも同じURLです。開始時刻の19:00になりましたら、こちらからご参加ください。',
    '',
    '■お問い合わせ',
    'BEST SALON REPORT',
    '株式会社P.C.C.',
    'メール：info@pccinc.jp',
    '',
    '※このメールにお心当たりのない場合は、お手数ですが上記までご連絡ください。'
  ].join('\n');

  sendMail_(d.email, subject, body, CONFIG.REPLY_TO);
}

function sendNotify_(d) {
  var subject = '【BSRセミナー】お申し込みがありました（' + DATES[d.date] + '）';
  var body = [
    'BEST SALON REPORT 無料オンラインセミナーのLPからお申し込みがありました。',
    '',
    '受付番号：' + d.submissionId,
    '申込日時：' + d.receivedAt,
    '',
    '【参加希望日】',
    DATES[d.date],
    '',
    '【お名前】',
    d.name,
    '',
    '【サロン名】',
    d.salon,
    '',
    '【役職】',
    d.position || '（未入力）',
    '',
    '【メール】',
    d.email,
    '',
    '【携帯電話番号】',
    d.phone,
    '',
    '【当日聞きたいこと】',
    d.question || '（未入力）',
    '',
    '【流入元】',
    'utm_source：' + d.utm.utm_source,
    'utm_medium：' + d.utm.utm_medium,
    'utm_campaign：' + d.utm.utm_campaign,
    'utm_content：' + d.utm.utm_content
  ].join('\n');

  // 返信すると申込者に届くようにする
  sendMail_(CONFIG.NOTIFY_TO, subject, body, d.email);
}

function sendMail_(to, subject, body, replyTo) {
  var options = { name: CONFIG.SENDER_NAME, replyTo: replyTo };
  if (CONFIG.FROM_ADDRESS) {
    options.from = CONFIG.FROM_ADDRESS;
    GmailApp.sendEmail(to, subject, body, options);
  } else {
    MailApp.sendEmail(to, subject, body, options);
  }
}

function getProps_() {
  var props = PropertiesService.getScriptProperties();
  var zoomUrl = props.getProperty('ZOOM_URL');
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!zoomUrl || !spreadsheetId) {
    throw new Error('スクリプト プロパティに ZOOM_URL と SPREADSHEET_ID を登録してください');
  }
  return { zoomUrl: zoomUrl, spreadsheetId: spreadsheetId };
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(getProps_().spreadsheetId);
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
}

function str_(v, max) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}

function toHalf_(s) {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ＠．＿＋]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  }).replace(/[ー－―‐−]/g, '-');
}

// 「=」などで始まる入力が数式として動かないようにする
function safeCell_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
