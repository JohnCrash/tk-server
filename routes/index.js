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
              UnitBegin:m[1],
              UnitEnd:m[2]
            });
          }
        }
        res.json(ret);
      }else{
        //search units
        new sql.ConnectionPool(config).connect().then(pool=>{
            return pool.request().query(`select id,BookLesson from BookIndex where BookName='${BookName}' and BookUnit='${Module}'`);
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
          return pool.request().query(`select distinct BookUnit from BookIndex where BookName='${BookName}'`);
        }).then(result=>{
          let ret = [];
          for( let i=0;i<result.recordset.length;i++){
            ret.push({Module:result.recordset[i].BookUnit});
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

/*
 * 返回具体的题目
 * 参数QuestionID or tid
 * 返回:
 * {
 *  type: {类型}
 *  state: {状态}
 *  tag: {考点}
 *  body: {题目}
 *  answer: {回答}
 *  analysis: {解析}
 *  css: {css}
 *  image: {拍照图}
 *  BookIndex: {分类}
 *  tid: {题目id}
 *  qid: {问题id}
 * }
 */
router.get('/topic/', function (req, res) {
  let QuestionID = req.query['QuestionID'];
  let tid = req.query['tid'];
  var queryStr;
  if(QuestionID){
    queryStr = `select state,type,bookindexid,tid,qid,
      topic_body,topic_tag,topic_answer,topic_analysis,topic_image,topic_css
        from raw_db where rowid='${QuestionID}'`;
  }else if(tid){
    queryStr = `select state,type,bookindexid,tid,qid,
      topic_body,topic_tag,topic_answer,topic_analysis,topic_image,topic_css
        from raw_db where tid='${tid}'`;  
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
    })      
});

module.exports = router;
