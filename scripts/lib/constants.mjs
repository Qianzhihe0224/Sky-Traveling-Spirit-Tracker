// 共享常量：数据源与接口
export const OFFICIAL_UID = '154db622a20e4327ac277bc35d4f2e76';
export const OFFICIAL_NICK = 'Sky光遇';
export const LIST_URL = 'https://inf.ds.163.com/v1/web/feed/basic/getSomeOneFeeds';
export const DETAIL_URL = 'https://inf.ds.163.com/v1/web/feed/basic/facade';
export const FEED_TYPES = '1,2,3,4,6,7,10,11';
export const FEED_PAGE_URL = id => `https://ds.163.com/feed/${id}/`;
export const USER_AGENT = 'sky-cn-returning-spirits/1.0 (official-announcement archive; contact: local)';

// 复刻相关关键词（用于候选召回，宁可多召回，靠人工排除）
// 注意：不要用裸的"复刻"，否则会命中"复刻了冥龙的威严"这类比喻句
export const SPIRIT_KEYWORDS = [
  '旅行先祖',
  '复刻先祖',
  '先祖复刻',
  '先祖到临',
  '先祖到访',
  '即将到访',
  '先祖返场',
  '集结回归',
  '集体复刻',
  '集体回归',
];

// 明显不是复刻公告的活动类文案
export const NON_SPIRIT_EVENT_HINTS = ['活动时间', '活动期间', '版本更新', '停服维护', '更新公告'];

// 集体复刻关键词
export const GROUP_KEYWORDS = ['集体复刻', '集体回归', '共同回归', '先祖齐聚', '一同回归', '集体到访'];
