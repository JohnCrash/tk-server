var sql = require('mssql');
var fs = require('fs');
var express = require('express');
var multiparty = require('multiparty');
var crypto = require('crypto');

var router = express.Router();

const config = {
  user:'sa',
  password:'123456',
  server:'192.168.2.15',
  database:'ep_tiku',
};
const upload = 'G:/tk/react-tiku/public/images/';//上传路径
const images_host = 'images/'; //外部访问路径相对或者绝对

const alltopicBOOK = '全部题库';

function sqlQuery(query,cb,ep){
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(query);
  }).then(result=>{
    cb(result);
  }).catch(err=>{
    ep(err);
  });
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
  sqlQuery('select distinct BookName from BookIndex',(result)=>{
    let ret = [];
    ret.push({BookName:alltopicBOOK});
    for( let i=0;i<result.recordset.length;i++){
      ret.push(result.recordset[i]);
    }
    res.json(ret);
  },
  (err)=>{
    res.send(err);
  });
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
 * 根据开始索引和结束索引来返回一个集合
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

/**
 * 上传图片，并将图片名称命名为该图片的md5
 * 使用multiparty库
 */
router.post('/upload_image/',function(req,res,next){
  var form = new multiparty.Form();
  var image;
  var title = 'title';

  form.on('error', next);
  form.on('close', function(){
    if(image){
      let data = new Uint8Array(image.size);
      let offset = 0;
      for(let i=0;i<image.bufs.length;i++){
        data.set(image.bufs[i],offset);
        offset+=image.bufs[i].length;
      }
      let buf = Buffer.from(data.buffer);
      var md5sum = crypto.createHash('md5');
      md5sum.update(buf);
      var md5name = md5sum.digest('hex');
      var m = image.filename.match(/.*\.(.*)$/);
      var ext = m?m[1]:'';
      var filename = `${upload}${md5name}.${ext}`;
      //如果文件已经存在，并且尺寸相同，不进行更新。
      fs.stat(filename,(err,stat)=>{
        if(!(stat&&stat.size==image.size)){
          fs.writeFile(filename,buf);
        }
        res.json({
          success:1,
          url:`${images_host}${md5name}.${ext}`,
          message:'ok'
        });
      });
    }else{
      res.json({
         success:0,
         message:'没有正常删除图片.',
      });
    }
  });

  // listen on field event for title
  form.on('field', function(name, val){
    if (name !== 'title') return;
    title = val;
  });

  // listen on part event for image file
  form.on('part', function(part){
    if (!part.filename) return;
    if (part.name !== 'editormd-image-file') return part.resume();
    image = {
      filename:part.filename,
      size:0,
      bufs:[],    
    };
    part.on('data', function(buf){
      console.log(`buf : ${buf.length}`);
      image.bufs.push(buf);
      image.size += buf.length;
    });
  });
  // parse the form
  form.parse(req);  
});

/**
 * 返回注册的设备信息
 */
router.post('/get_devices/',function(req,res,next){
  let queryStr = `select id,device_name,device_mac from DeviceInfo`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(queryStr);
  }).then(result=>{
    res.json(result.recordset);
  }).catch(err=>{
    res.send(err);
  });
});

/**
 * 删除一个设备
 */
router.post('/remove_devices/',function(req,res,next){
  let id = req.query['id'];
  let queryStr = `delete from DeviceInfo where id=${id}`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(queryStr);
  }).then(result=>{
    res.send('ok');
  }).catch(err=>{
    res.send(err);
  });
});

/**
 * 添加一个设备
 */
router.post('/add_devices/',function(req,res,next){
  let deviceName = req.query['name'];
  let deviceMac = req.query['mac'];
  
  let queryStr = `insert into DeviceInfo (device_name,device_mac) values ('${deviceName}','${deviceMac}')`;
  let queryStr2 = `select id from DeviceInfo where device_mac='${deviceMac}'`;

  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(queryStr2);
  }).then(result=>{
    if( result.recordset.length==0 ){
      new sql.ConnectionPool(config).connect().then(pool=>{
        return pool.request().query(queryStr);
      }).then(result=>{
        new sql.ConnectionPool(config).connect().then(pool=>{
          return pool.request().query(queryStr2);
        }).then(result=>{
          res.send(result.recordsets[0].id);
        }).catch(err=>{
          res.send(err);
        });  
      }).catch(err=>{
        res.send(err);
      }); 
    }else{
      res.send('设备已经存在!');
    }
  }).catch(err=>{
    res.send(err);
  });
});

/**
 * 输入作业帮的题目
 */
router.get('/import/',function(req,res,next){
  res.set('Content-Type','text/event-stream');
  res.set('Cache-Control','no-cache');
  res.set('Connection','Keep-Alive');
  res.send('ok\n');
  res.end();
});

/**
 * 获取科目
 * select distinct BookSubject from BookIndex
 */
router.get('/BookSubject/',function(req,res,next){
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query('select BookSubject,max(id) as uid from BookIndex group by BookSubject order by uid');
  }).then(result=>{
    let ret = [];
    for( let i=0;i<result.recordset.length;i++){
      if(result.recordset[i].BookSubject)
        ret.push({BookSubject:result.recordset[i].BookSubject});
    }
    res.json(ret);
  }).catch(err=>{
    res.send(err);
  })
});

/**
 * 获取版本
 */
router.get('/BookVersion/',function(req,res,next){
  let BookSubject = req.query['BookSubject'];
  let strQury = `select BookVersion,max(id) as uid from BookIndex where BookSubject=N'${BookSubject}' group by BookVersion order by uid`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(strQury);
  }).then(result=>{
    let ret = [];
    for( let i=0;i<result.recordset.length;i++){
      ret.push({BookVersion:result.recordset[i].BookVersion});
    }
    res.json(ret);
  }).catch(err=>{
    res.send(err);
  })
});
/**
 * 获取册
 */
router.get('/BookPeriod/',function(req,res,next){
  let BookSubject = req.query['BookSubject'];
  let BookVersion = req.query['BookVersion'];
  let strQury = `select BookPeriod,max(id) as uid from BookIndex where BookSubject=N'${BookSubject}' and BookVersion=N'${BookVersion}' group by BookPeriod order by uid`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(strQury);
  }).then(result=>{
    let ret = [];
    for( let i=0;i<result.recordset.length;i++){
      ret.push({BookPeriod:result.recordset[i].BookPeriod});
    }
    res.json(ret);
  }).catch(err=>{
    res.send(err);
  })
});
/**
 * 获取章
 */
router.get('/Chapter/',function(req,res,next){
  let BookSubject = req.query['BookSubject'];
  let BookVersion = req.query['BookVersion'];
  let BookPeriod = req.query['BookPeriod'];
  let strQury = `select BookUnit,max(id) as uid from BookIndex where BookSubject=N'${BookSubject}' and BookVersion=N'${BookVersion}' and BookPeriod=N'${BookPeriod}' group by BookUnit order by uid`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(strQury);
  }).then(result=>{
    res.json(result.recordset);
  }).catch(err=>{
    res.send(err);
  })
});
/**
 * 获取节
 */
router.get('/Section/',function(req,res,next){
  let BookSubject = req.query['BookSubject'];
  let BookVersion = req.query['BookVersion'];
  let BookPeriod = req.query['BookPeriod'];
  let BookChapter = req.query['BookChapter'];
  let strQury = `select BookUnit,BookLesson,ChapterID,SectionID from BookIndex where BookSubject=N'${BookSubject}' and BookVersion=N'${BookVersion}' and BookPeriod=N'${BookPeriod}' and BookUnit=N'${BookChapter}'`;
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(strQury);
  }).then(result=>{
    let ret = [];
    for(let i=0;i<result.recordset.length;i++){
      let t = result.recordset[i];
      if(t.BookLesson && t.BookLesson != "NULL"){
        ret.push({
          BookLesson:t.BookLesson,
          ChapterID:t.ChapterID,
          SectionID:t.SectionID
        });
      }
    }
    res.json(ret);
  }).catch(err=>{
    res.send(err);
  })
});

/**
 * 获取节下的题，以10题为一个分页
 * 分页查询语句
 * select * from (select *,row_number() over(order by rowid) as 'RowNumber' from raw_db where bookindexid=25) a where a. RowNumber between 10 and 20
 * 或者
 * select top 10 rowid from (SELECT TOP 30 rowid FROM raw_db where bookindexid=25 order by rowid asc) a order by rowid desc
 * 第二种方法返回的是反序的，并在页尾时要做特殊判断
 */
router.get('/SectionPage10/',function(req,res,next){
  let SectionID = req.query['SectionID'];
  let SectionPage = req.query['SectionPage'];
  let PageCount = req.query['PageCount'];

  function getpage(){
    let strQury2;
    
    if(!SectionPage){
      SectionPage = 1;
    }
    strQury2 = `select * from (select *,row_number() over(order by rowid desc) as 'RowNumber' from raw_db where bookindexid=${SectionID}) a where a. RowNumber between ${(SectionPage-1)*10+1} and ${SectionPage*10} order by rowid desc`;
    new sql.ConnectionPool(config).connect().then(pool=>{
      return pool.request().query(strQury2);
    }).then(result=>{
      let r = {
        sectionID:SectionID,
        pageCount:Number(PageCount),
        currentPage:SectionPage,
        items:result.recordset};
      res.send(r);
    }).catch(err=>{
      res.send(err);
    })
  }
  if(PageCount){ //如果已经给出了页数就不进行查找了
    getpage();
  }else{
    let strQury = `select count(rowid) from raw_db where bookindexid=${SectionID}`;
    new sql.ConnectionPool(config).connect().then(pool=>{
      return pool.request().query(strQury);
    }).then(result=>{
      PageCount = Math.ceil(result.recordset[0][""]/10);
      getpage();
    }).catch(err=>{
      res.send(err);
    })
  }
});

/**
 * 加入一个新markd题
 */
router.get('/add/',function(req,res){
  let SectionID = req.query['SectionID'];
  //初始化加入time(重建时间)，processdate(处理时间)，bookindexid，userid，state，seat
  let queryStr = `insert into raw_db (time,processdate,bookindexid,userid,state,seat_body,markd_body,seat_answer,markd_answer,seat_analysis,markd_analysis,seat_tag,markd_tag) values 
  (getdate(),getdate(),${SectionID},0,-1,2,'',2,'',2,'',2,'') select @@identity`;
  sqlQuery(queryStr,(result)=>{
    res.json({rowid:result.recordset[0][""]});
  },(err)=>{
    res.send(err);
  });
});

/**
 * 清理章节下全部
 */
router.get('/clear/',function(req,res){
  let SectionID = req.query['SectionID'];
  if(SectionID){
    let queryStr = `delete from raw_db where bookindexid=${SectionID} and state=-1`;
    sqlQuery(queryStr,(result)=>{
      res.send('ok');
    },(err)=>{
      res.send(err);
    });
  }else{
    res.send('can not found argument SectionID');
  }
});

/**
 * 登录
 */
router.post('/login/',function(req,res){
  let cc = req.cookies.cc;
  if(cc){ //通过cookie登录
    sqlQuery(`select * from UserInfo where cookie='${cc}'`,(result)=>{
      if(result.recordset[0] && result.recordset[0].UserName && result.recordset[0].UserAcount){
        sqlQuery(`update UserInfo set lastlogin=getdate() where UserAcount='${result.recordset[0].UserAcount}'`,()=>{},()=>{});
          res.json({
            result:'ok',
            user:result.recordset[0].UserName
          });
      }else{
        res.json({result:'请重新输入密码'});
      }
    },(err)=>{
      res.send(err);
    });
    return;
  }
  let user = req.body.user;
  let passwd = req.body.passwd;
  if(!(user && passwd)){
    res.json({result:'请输入用户名密码'});
    return;
  } 
  sqlQuery(`select * from UserInfo where UserAcount='${user}'`,(result)=>{
    if( result.recordset[0] && 'UserPwd' in result.recordset[0]){
      if(result.recordset[0].UserPwd===passwd){
        let cookie = result.recordset[0].cookie;
        let userName = result.recordset[0].UserName;
        if(!cookie){//产生一个新的cookie
          var md5sum = crypto.createHash('md5');
          md5sum.update(user+passwd);
          cookie = md5sum.digest('hex');
          sqlQuery(`update UserInfo set cookie='${cookie}' where UserAcount='${user}'`,(result)=>{},(err)=>{});
        }
        sqlQuery(`update UserInfo set lastlogin=getdate() where UserAcount='${result.recordset[0].UserAcount}'`,()=>{},()=>{});
        res.cookie('cc',cookie);
        res.json({
          result:'ok',
          user:userName
        });
      }else{
        res.json({result:'密码不正确'});
      }
    }else{
      res.json({result:'用户名不存在'});
    }
  },(err)=>{
    res.send(err);
  });
});

/**
 * 登出
 */
router.post('/logout/',function(req,res){
  res.clearCookie('cc');
  res.json('ok');  
});

module.exports = router;
