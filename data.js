/*
 * 工作台数据快照（由云端 build_cloud.py 自动生成，勿手工修改）
 * 数据唯一事实源：source/ 下每日 md + progress.json + notes.json
 */
window.WB_DATA = {
  source: "source/",
  snapshot_date: "2026-07-30",

  // 考公：公考常识判断/progress.json
  kaogong: {
    progress: {"day": 1, "last_module": 1, "recent_topics": [], "last_date": "2026-07-30"},
    modules: ["政治", "法律", "经济", "人文历史", "科技与生活", "地理国情", "管理公文"],
    weakness: null,
    wrongbook: null,
    weekly_quiz: null,
    today_md: ``,
    history_md: []
  },

  // 理财：财经热点知识/progress.json
  licai: {
    progress: {"day": 1, "level": "L1", "covered": [], "last_date": "2026-07-30"},
    levels: ["L1 基础认知", "L2 市场术语", "L3 策略指标", "L4 宏观风险", "L5 进阶专题"],
    fund: [{"name": "沪深300ETF", "code": "510300", "price": 4.605, "chg": -1.12, "sector": "宽基指数·沪深300"}, {"name": "中证500ETF", "code": "510500", "price": 7.336, "chg": -2.71, "sector": "宽基指数·中证500"}, {"name": "创业板ETF", "code": "159915", "price": 3.27, "chg": -3.88, "sector": "宽基指数·创业板"}, {"name": "华夏电网ETF联接C", "code": "025857", "price": 1.1133, "chg": 1.46, "sector": "新能源·电网设备"}, {"name": "易方达中证A500A", "code": "022459", "price": 1.2496, "chg": 0.73, "sector": "宽基指数·中证A500"}, {"name": "广发纳指100ETFC", "code": "006479", "price": 7.5778, "chg": -0.98, "sector": "海外·纳斯达克100(QDII)"}, {"name": "汇添富竞争优势", "code": "007639", "price": 2.4786, "chg": -1.83, "sector": "主动权益·混合偏股"}],
    today_md: ``,
    history_md: []
  },

  // 笔记：浏览器导出后落到 source/notes.json，云端嵌入后可跨设备同步
  notes: {}
};
