sql = require('mssql')

var express = require('express');
var router = express.Router();

const config = {
  user:'sa',
  password:'123456',
  server:'192.168.2.15',
  database:'ep_tiku',
}

const alltopicBOOK = '全部题库';
/*
 * 返回书面列表
 * 无参数
 * 返回
 * [{
 *  BookName {Book name}
 * },...]
 */
router.get('/book/', function (req, res) {
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query('select distinct BookName from BookIndex');
  }).then(result=>{
    let ret = [];
    ret.push({BookName:alltopicBOOK});
    for( let i=0;i<result.recordset.length;i++){
      ret.push(result.recordset[i]);
    }
    res.json(ret);
  }).catch(err=>{
    res.send(err);
  })
});

/*
 * 返回书的章节
 * 参数Book,Module
 * 如果仅仅给出BookName返回书中包含的全部章(Module)
 * 返回
 * [{
 *  Module: {Module name}
 * },...]
 * 如果给出BookName,ModuleName将返回该章下的全部节(Unit)以及节的id
 * 返回
 * [{
 *  BookIndex: {Unit id}
 *  Unit: {Unit name}
 *  Tatal: {单元下的总题数}
 *  Processed: {处理过的}
 * }]
 */
router.get('/module/', function (req, res) {
  let BookName = req.query['Book'];
  let Module = req.query['Module'];
  if(BookName){
    if(Module){
      if(BookName===alltopicBOOK){
        //全部
        let m = Module.match(/SECTION\s(\d+)-(\d+)/);
        let ret = [];
        if(m && m[1] && m[2]){
          
          for( let i=Number(m[1]);i<Number(m[2]);i+=10 ){
            ret.push({
              Unit:`UNIT ${i}-${i+10}`,
              UnitBegin:i,
              UnitEnd:i+10,
            });
          }
        }
        res.json(ret);
      }else{
        //search units
        new sql.ConnectionPool(config).connect().then(pool=>{
            return pool.request().query(`select id,BookLesson from BookIndex where BookName='${BookName}' and BookUnit='${Module}' order by id`);
          }).then(result=>{
            let ret = [];
            for( let i=0;i<result.recordset.length;i++){
              ret.push({BookIndex:result.recordset[i].id,
                Unit:result.recordset[i].BookLesson});
            }
            res.json(ret);
          }).catch(err=>{
            res.send(err);
          })
      }
    }else if(BookName===alltopicBOOK){
      //枚举全部题库数据，每个章中有10个节，每个节有10个题。每一章就有100题
      new sql.ConnectionPool(config).connect().then(pool=>{
        return pool.request().query(`SELECT max(rowid) as count FROM raw_db`);
      }).then(result=>{
        let count = result.recordset[0].count;
        let i;
        let ret = [];
        for(i = 0;i<count;i+=100){
          if(i+100<count)
            ret.push({Module:`SECTION ${i}-${i+100}`});
          else
            ret.push({Module:`SECTION ${i}-${count}`});
        }
        res.json(ret);
      }).catch(err=>{
        res.send(err);
      });
    }else{
      //search modules
      new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(`select id,BookUnit from BookIndex where BookName='${BookName}' order by id`);
        }).then(result=>{
          let ret = [];
          let lastBookUnit;
          for( let i=0;i<result.recordset.length;i++){
            if(lastBookUnit!==result.recordset[i].BookUnit){
              ret.push({Module:result.recordset[i].BookUnit});
              lastBookUnit = result.recordset[i].BookUnit;
            }
          }
          res.json(ret);
        }).catch(err=>{
          res.send(err);
        })
    }
  }else{
    res.send(`invalid argumnets,can not find 'BookName'`);
  }
});

/*
 * 返回节(BookIndex)下的所有题
 * 参数id
 * [{
 *  state: {1选择题，2填空题，3解答题，4其他，－1忽略，0未处理}
 *  type: {-1已删除，0未定义，1相同题，2相关题}
 *  BookIndexID: {章节信息}
 *  QuestionID: {题的id}
 *  TopicID: {题的id}
 *  UserID: {录入者id}
 * },...]
 */
router.get('/unit/', function (req, res) {
  let BookIndex = req.query['BookIndex'];
  if(BookIndex){
      new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(`select QuestionID,RawID,UserID from Question where BookIndexID='${BookIndex}'`);
        }).then(result=>{
          let ret = [];
          for( let i=0;i<result.recordset.length;i++){
            ret.push({BookIndexID:BookIndex,
            QuestionID:result.recordset[i].QuestionID,
            TopicID:result.recordset[i].RawID,
            UserID:result.recordset[i].UserID});
          }
          res.json(ret);
        }).catch(err=>{
          res.send(err);
        })    
  }else{
    res.send(`invalid argumnets,can not find 'BookIndex'`)
  }
});

/**
 * 根据开始索引和结束索引来返回一个几何
 * 返回
 *  [{
 *  BookIndexID: {章节信息}
 *  QuestionID: {题的id}
 *  TopicID: {题的id}
 *  UserID: {录入者id}
 * },...]
 */
router.get('/unitbyindex/', function (req, res) {
  let begin = req.query['UnitBegin'];
  let end = req.query['UnitEnd'];
  if(begin && end){
      new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(`select rowid,id,userid from raw_db where rowid>${begin} and rowid<=${end}`);
        }).then(result=>{
          let ret = [];
          for( let i=0;i<result.recordset.length;i++){
            ret.push({
            QuestionID:result.recordset[i].rowid,
            TopicID:result.recordset[i].id,
            UserID:result.recordset[i].userid});
          }
          res.json(ret);
        }).catch(err=>{
          res.send(err);
        })    
  }else{
    res.send(`invalid argumnets,can not find 'BookIndex'`)
  }
});

/*
 * 返回具体的题目
 * 参数QuestionID or tid
 *  state: {1选择题，2填空题，3解答题，4其他，－1忽略，0未处理}
 *  type: {-1已删除，0未定义，1相同题，2相关题}
 * 返回:
 * {
 *  type: {类型}
 *  state: {状态}
 *  tag: {考点}
 *  body: {题面}
 *  answer: {回答}
 *  analysis: {解析}
 *  topic_css: {topic_css}
 *  image: {拍照图}
 *  BookIndex: {分类}
 *  source: {源地址}
 *  tid: {题目id}
 *  qid: {问题id}
 *  markd_body {题面markdown}
 *  markd_answer {答案markdown}
 *  markd_analysis {解析markdown}
 *  markd_tag {标签markdown}
 * }
 */
router.get('/topic/', function (req, res) {
  let QuestionID = req.query['QuestionID'];
  let tid = req.query['tid'];
  var queryStr;
  queryStr = `select state,type,bookindexid,source,tid,qid,topic_image,topic_css,
      topic_body,topic_answer,topic_analysis,topic_tag,
      body,answer,analysis,tag,
      markd_body,markd_answer,markd_analysis,markd_tag,
      seat_body,seat_answer,seat_analysis,seat_tag
        from raw_db where `;
  if(QuestionID){
    queryStr = queryStr + "rowid='" + QuestionID + "'";
  }else if(tid){
    queryStr = queryStr + "tid='" + tid + "'";
  }else{
    res.send(`invalid argumnets,can not find 'QuestionID' or 'TopicID' or 'tid'`);
    return;
  }
  new sql.ConnectionPool(config).connect().then(pool=>{
      return pool.request().query(queryStr);
    }).then(result=>{
      res.json(result.recordset[0]);
    }).catch(err=>{
      res.send(err);
    });      
});

/**
 * 上传交互式题干body
 */
router.post('/upload/',function(req,res){
  let QuestionID = req.query['QuestionID'];
  if(QuestionID){
    let queryStr = `update raw_db set `;
    let prefix = '';
    if('state' in req.body){
      queryStr += `${prefix}state='${req.body.state}'`;  
      prefix = ',';
    }
    if('body' in req.body){
      let body = req.body.body.replace(/'/g,"''");
      queryStr += `${prefix}body=N'${body}'`;
      prefix = ',';
    }
    if('answer' in req.body){
      let answer = req.body.answer.replace(/'/g,"''");
      queryStr += `${prefix}answer=N'${answer}'`;
      prefix = ',';
    }
    if('analysis' in req.body){
      let analysis = req.body.analysis.replace(/'/g,"''");
      queryStr += `${prefix}analysis=N'${analysis}'`;
      prefix = ',';
    }    
    if('tag' in req.body){
      let tag = req.body.tag.replace(/'/g,"''");
      queryStr += `${prefix}tag=N'${tag}'`;
      prefix = ',';
    }        
    if('markd_body' in req.body){
      let markd_body = req.body.markd_body.replace(/'/g,"''");
      queryStr += `${prefix}markd_body=N'${markd_body}'`;
      prefix = ',';
    }
    if('markd_answer' in req.body){
      let markd_answer = req.body.markd_answer.replace(/'/g,"''");
      queryStr += `${prefix}markd_answer=N'${markd_answer}'`;
      prefix = ',';
    }
    if('markd_analysis' in req.body){
      let markd_analysis = req.body.markd_analysis.replace(/'/g,"''");
      queryStr += `${prefix}markd_analysis=N'${markd_analysis}'`;
      prefix = ',';
    }      
    if('markd_tag' in req.body){
      let markd_tag = req.body.markd_tag.replace(/'/g,"''");
      queryStr += `${prefix}markd_tag=N'${markd_tag}'`;
      prefix = ',';
    }  
    if('seat_body' in req.body){
      queryStr += `${prefix}seat_body=${req.body.seat_body}`;
      prefix = ',';
    }
    if("seat_answer" in req.body){
      queryStr += `${prefix}seat_answer=${req.body.seat_answer}`;
      prefix = ',';
    }
    if('seat_analysis' in req.body){
      queryStr += `${prefix}seat_analysis=${req.body.seat_analysis}`;
      prefix = ',';
    }      
    if('seat_tag' in req.body){
      queryStr += `${prefix}seat_tag=${req.body.seat_tag}`;
      prefix = ',';
    }          
    queryStr += ` where rowid=${QuestionID}`;
    new sql.ConnectionPool(config).connect().then(pool=>{
      return pool.request().query(queryStr);
    }).then(result=>{
      if(result.rowsAffected.length>0)
        res.send('ok');
      else
        res.send(`can not find QuestionID : ${QuestionID}`);
    }).catch(err=>{
      res.send(err);
    });   
  }else{
    res.send(`invalid argumnets,can not find 'QuestionID'`);
  }
});
module.exports = router;
