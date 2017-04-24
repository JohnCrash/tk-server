sql = require('mssql')

var express = require('express');
var router = express.Router();

const config = {
  user:'sa',
  password:'123456',
  server:'192.168.2.15',
  database:'ep_tiku',
}

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
    return pool.request().query('select distinct BookName from BookIndex')
  }).then(result=>{
    let ret = []
    for( let i=0;i<result.recordset.length;i++){
      ret.push(result.recordset[i])
    }
    res.json(ret)
  }).catch(err=>{
    res.send(err)
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
 * }]
 */
router.get('/module/', function (req, res) {
  let BookName = req.query['Book'];
  let Module = req.query['Module'];
  if(BookName){
    if(Module){
      //search units
      new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(`select id,BookLesson from BookIndex where BookName='${BookName}' and BookUnit='${Module}'`)
        }).then(result=>{
          let ret = []
          for( let i=0;i<result.recordset.length;i++){
            ret.push({BookIndex:result.recordset[i].id,
              Unit:result.recordset[i].BookLesson})
          }
          res.json(ret)
        }).catch(err=>{
          res.send(err)
        })
    }else{
      //search modules
      new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(`select distinct BookUnit from BookIndex where BookName='${BookName}'`)
        }).then(result=>{
          let ret = [];
          for( let i=0;i<result.recordset.length;i++){
            ret.push({Module:result.recordset[i].BookUnit})
          }
          res.json(ret)
        }).catch(err=>{
          res.send(err)
        })
    }
  }else{
    res.send(`invalid argumnets,can not find 'BookName'`)
  }
});

/*
 * 返回节(BookIndex)下的所有题
 * 参数id
 * [{
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
          return pool.request().query(`select QuestionID,RawID,UserID from Question where BookIndexID='${BookIndex}'`)
        }).then(result=>{
          let ret = [];
          for( let i=0;i<result.recordset.length;i++){
            ret.push({BookIndexID:BookIndex,
            QuestionID:result.recordset[i].QuestionID,
            TopicID:result.recordset[i].RawID,
            UserID:result.recordset[i].UserID})
          }
          res.json(ret)
        }).catch(err=>{
          res.send(err)
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
        from raw_db where rowid='${QuestionID}'`
  }else if(tid){
    queryStr = `select state,type,bookindexid,tid,qid,
      topic_body,topic_tag,topic_answer,topic_analysis,topic_image,topic_css
        from raw_db where tid='${tid}'`    
  }else{
    res.send(`invalid argumnets,can not find 'QuestionID' or 'TopicID' or 'tid'`)
    return
  }
  new sql.ConnectionPool(config).connect().then(pool=>{
      return pool.request().query(queryStr)
    }).then(result=>{
      res.json(result.recordset[0])
    }).catch(err=>{
      res.send(err)
    })      
});

module.exports = router;
