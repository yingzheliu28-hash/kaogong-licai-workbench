/*
 * 工作台数据快照（由云端 build_cloud.py 自动生成，勿手工修改）
 * 数据唯一事实源：source/ 下每日 md + progress.json + 每周小测/<日期>.md + 我的错题本.md + notes.json
 */
window.WB_DATA = {
  source: "source/",
  snapshot_date: "2026-08-10",

  // 考公：公考常识判断/progress.json
  kaogong: {
    progress: {"day": 1, "last_module": 1, "recent_topics": [], "last_date": "2026-08-10"},
    modules: ["政治", "法律", "经济", "人文历史", "科技与生活", "地理国情", "管理公文"],
    weekly_summary: null,
    weekly_range: null,
    weekly_quiz: null,
    quiz_history: [],
    quiz_stats: {"cumulative": false, "total_quizzes": 0},
    wrongbook: null,
    weakness: null,
    weakness_modules: [],
    today_md: ``,
    history_md: []
  },

  // 理财：财经热点知识/progress.json
  licai: {
    progress: {"day": 1, "level": "L1", "covered": [], "last_date": "2026-08-10"},
    levels: ["L1 基础认知", "L2 市场术语", "L3 策略指标", "L4 宏观风险", "L5 进阶专题"],
    fund: [{"name": "沪深300ETF", "code": "510300", "price": 4.729, "chg": -0.46, "sector": "宽基指数·沪深300"}, {"name": "中证500ETF", "code": "510500", "price": 7.944, "chg": -0.54, "sector": "宽基指数·中证500"}, {"name": "创业板ETF", "code": "159915", "price": 3.509, "chg": -2.15, "sector": "宽基指数·创业板"}, {"name": "华夏电网ETF联接C", "code": "025857", "price": 1.1764, "chg": 1.31, "sector": "新能源·电网设备"}, {"name": "易方达中证A500A", "code": "022459", "price": 1.2887, "chg": 1.3, "sector": "宽基指数·中证A500"}, {"name": "广发纳指100ETFC", "code": "006479", "price": 8.0062, "chg": -0.39, "sector": "海外·纳斯达克100(QDII)"}, {"name": "汇添富竞争优势", "code": "007639", "price": 2.5363, "chg": 2.68, "sector": "主动权益·混合偏股"}],
    weekly_summary: null,
    weekly_hot: null,
    weekly_range: null,
    today_md: ``,
    history_md: []
  },

  // 笔记：浏览器导出后落到 source/notes.json，云端嵌入后可跨设备同步
  notes: {}
};
