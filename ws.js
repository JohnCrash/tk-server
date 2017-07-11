var fs = require('fs');
const child_process = require('child_process');
var WebSocket = require('faye-websocket');
var http      = require('http');
 
var server = http.createServer();
var devices = {};

server.on('upgrade', function(request, socket, body) {
  if (WebSocket.isWebSocket(request) && request.url) {
    var mac = request.url.replace(/\//g,'');
    var current = devices[mac];
    var ws = new WebSocket(request, socket, body);

    ws.on('message', function(event) {
      console.log('message:'+event.data);
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
    });
    
    ws.on('close', function(event) {
      console.log('close', event.code, event.reason);
      if(current &&current.reqws === ws){
        current.reqws = null;
      }
      if(devices[mac] && devices[mac].ws===ws){
        devices[mac].ws = null;
      }
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
    }
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
    '-i','1','-Q']);
    tshark.stdout.on('data', (data) => {
      console.log(`tshark: ${data}`);
    });

    tshark.stderr.on('data', (data) => {
      console.log(`tshark err: ${data}`);
    });

    tshark.on('close', (code) => {
      console.log(`tshark exited with code ${code}`);
    });  
  }
}
launchTshark();

/**
 * 调用python脚本处理url
 */
function processShareUrl(){
  let cp = child_process.spawn('python',[`${process.argv[3]}/tools/curlcapturebyjs.py`,process.argv[3]]);
  cp.stdout.on('data', (data) => {
    console.log(`csu: ${data}`);
  });

  cp.stderr.on('data', (data) => {
    console.log(`csu err: ${data}`);
  });

  cp.on('close', (code) => {
    console.log(`curlcapture.py exited with code ${code}`);
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
