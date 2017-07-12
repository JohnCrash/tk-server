var fs = require('fs');
const child_process = require('child_process');
var WebSocket = require('faye-websocket');
var http      = require('http');
const { StringDecoder } = require('string_decoder');
var sql = require('mssql');

const config = {
  user:'sa',
  password:'123456',
  server:'192.168.2.15',
  database:'ep_tiku',
};
function sqlQuery(query,cb,ep){
  new sql.ConnectionPool(config).connect().then(pool=>{
    return pool.request().query(query);
  }).then(result=>{
    cb(result);
  }).catch(err=>{
    ep(err);
  });
}

var server = http.createServer();
var devices = {};

server.on('upgrade', function(request, socket, body) {
  if (WebSocket.isWebSocket(request) && request.url) {
    var cookies = request.headers.cookie;
    if(!cookies){
      seocket.write('no cookie');
      socket.end();
      return;
    }
    cookies = cookies.split('; ');
    var cookie = cookies.filter((t)=>{
      return t.match(/cc=(.*)/);
    });
    if(cookie.length!=1){
      seocket.write('no cookie cc');
      socket.end();
      return;
    }
    cookie = cookie[0].replace(/^cc=(.*)/,($1,$2)=>{
      return $2;
    });
    sqlQuery(`select * from UserInfo where cookie='${cookie}'`,(result)=>{
      if(!(result && result.recordsets && result.recordsets[0])){
        seocket.write('invalid cookie cc='+cookie);
        socket.end();
        return;
      }
      var userinfo = result.recordsets[0][0];
      var mac = request.url.replace(/\//g,'');
      var current = devices[mac];
      var ws = new WebSocket(request, socket, body);

      ws.on('message', function(event) {
        switch(event.data){
          case 'accept':
            if(devices[mac].reqws){
              ws.send('refuse');
              ws.close();
              devices[mac].ws = devices[mac].reqws;
              devices[mac].reqws = null;
              devices[mac].ws.send('accept');
            }
          break;
          case 'refuse':
            if(devices[mac].reqws){
              devices[mac].reqws.send('refuse');
              devices[mac].reqws.close();
              devices[mac].reqws = null;
            }
          break;
        }
        var m = event.data.match(/sectionid=(\d*)/);
        if(m){
          var sectionid = m[1];
          sqlQuery(`update DeviceInfo set SectionID='${sectionid}',UseAccount='${userinfo.UserAcount}' where device_mac='${mac}'`,(result)=>{
          },(err)=>{});
        }
      });
      
      ws.on('close', function(event) {
        console.log('close', event.code, event.reason);
        if(current &&current.reqws === ws){
          current.reqws = null;
        }
        if(devices[mac] && devices[mac].ws===ws){
          devices[mac].ws = null;
        }
        sqlQuery(`update DeviceInfo set SectionID=-1 where device_mac='${mac}'`,(result)=>{
        },(err)=>{});        
        ws = null;
      });

      if(current && current.ws){//存在
        if(current.reqws){
          ws.send('refuse');
          ws.close();
        }else{
          current.reqws = ws;
          current.ws.send('req');
        }
      }else{//不存在
        devices[mac] = {mac,ws};
        ws.send('accept');
      }},(err)=>{
        socket.send(err);
        socket.close();});
  }
});

console.log('websocket server start...'); 
server.listen(process.argv[2]);

var tshark;
/**
 * 启动抓取程序
 */
function launchTshark(){
  if(!tshark){
    console.log('tshark server...'); 
    tshark = child_process.spawn('tshark',['-X',`lua_script:${process.argv[3]}/tools/trap.lua`,
    '-i','4','-Q']);
    tshark.stdout.on('data', (data) => {
      console.log(`tshark: ${data}`);
    });

    tshark.stderr.on('data', (data) => {
      console.log(`tshark err: ${data}`);
    });

    tshark.on('close', (code) => {
      console.log(`tshark exited with code ${code}`);
      launchTshark();
    });  
  }
}
launchTshark();

/**
 * 调用python脚本处理url
 */
function processShareUrl(){
  let cp = child_process.spawn('python',[`${process.argv[3]}/tools/curlcapturebyjs.py`,process.argv[3]],{cwd:process.argv[3]});
  cp.stdout.on('data', (data) => {
    var de = new StringDecoder('utf8');
    var s = de.write(data);
    var m = s.match(/newzyb:(.*)/);
    if(m&&m[1]){
      let mac = m[1];
      if(devices[mac] && devices[mac].ws){
        console.log('send news.');
        devices[mac].ws.send('news');
      }
    }
    console.log(`python: ${data}`);
  });

  cp.stderr.on('data', (data) => {
    console.log(`python err: ${data}`);
  });

  cp.on('close', (code) => {
  }); 
}
var delay;
/**
 * 监控文件系统变化,抓取程序有新的更改
 */
fs.watch(process.argv[3]+'/share',(eventType,filename)=>{
  if(eventType==='change' && filename){
    if(!delay){
      delay = setInterval(()=>{
        clearInterval(delay);
        delay = undefined;
        processShareUrl();
      },100);
    }
  }
});
