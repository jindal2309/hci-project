var express = require('express');
var app= express();
var https = require('https');
const fs = require('fs');

const options = {
	  key: fs.readFileSync('key.pem'),
	  cert: fs.readFileSync('cert.pem')
};

var server = https.Server(options, app)

var privateKey  = fs.readFileSync('key.pem', 'utf8');
var certificate = fs.readFileSync('cert.pem', 'utf8');

const { PeerServer } = require('peer');
const peerServer = PeerServer({ port: 3001, 
                                path: '/' ,
                                ssl: {
                                    key: privateKey,
                                    cert: certificate
                                  }
                            
                            });


var io = require('socket.io')(server,{});
var mongojs = require("mongojs");
const uuidv4 = require("uuid/v4")
var db = mongojs("localhost:27017/titans", ['account','additional_info']);
var SOCKET_LIST = {};
var connected_users = new Set();
var window_height = 1;
var window_width = 1;

var Entity = function(){
	
	var self = {
		x:250,
		y:250,
		id:"",
		number: ""+ Math.floor(10 * Math.random()),
		spdX: 0,
		spdY: 0,
	}

	self.update = function(){
		self.updatePosition();
	}

	self.updatePosition = function(){
		if(self.x + self.spdX <= window_width-10 && self.x + self.spdX >= 0)
			self.x += self.spdX;
		
		if(self.y + self.spdY <= window_height && self.y + self.spdY >= 10)
			self.y += self.spdY;
	}	

	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x, 2) + Math.pow(self.y-pt.y, 2));
	}

	return self;
}


var Player = function(id, username){

	var self = Entity();
	self.id = id;
	self.number = ""+ Math.floor(10 * Math.random());
	self.move_left = false;
	self.move_right = false;
	self.move_up = false;
	self.move_down = false;
	self.speed = 1;
	self.name = username;
	self.userId = null;
	self.connected_peers =  new Set();
	self.meeting_history = new Set();
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		super_update();

		var socket = SOCKET_LIST[self.id];

		for(var i in Player.list){
			var p = Player.list[i];
			if(self.getDistance(p) < 220 && self.id !== p.id){
				if(self.connected_peers.has(p.userId) == false){
					self.connected_peers.add(p.userId);
					self.meeting_history.add(p.userId);
					socket.emit('user-connected', p.userId);
				}
			}

			else
			{
				if(self.connected_peers.has(p.userId) == true){
					self.connected_peers.delete(p.userId);
					socket.emit('delete-feed', p.userId)
				}
			}
		}
	}

	self.updateSpd = function(){

		if(self.move_left)
			self.spdX -= self.speed;
		else if(self.move_right)
			self.spdX += self.speed;
		else
			self.spdX = 0;

		if(self.move_up)
			self.spdY -= self.speed*.75;
		else if(self.move_down)
			self.spdY += self.speed*.75;
		else
			self.spdY = 0;
	}

	Player.list[id] = self;
	return self;
}

Player.list = {};

app.get('/',function(req,res){
	res.sendFile(__dirname + '/client/index.html');
});

app.get('/script.js',function(req,res){
	res.sendFile(__dirname + '/client/script.js');
});

app.use('/client', express.static(__dirname + '/client'));

server.listen(8001);
console.log("Server listening at 8001");

Player.onConnect = function(socket, username){
	socket.emit('getShape', {roomId: uuidv4()});
	console.log("Player " + username + " connected!");
	var player = Player(socket.id, username);

	socket.on('keyPress', function(data){
		if(data.inputId === 'left')
			player.move_left = data.state;
		else if(data.inputId === 'right')
			player.move_right = data.state;
		else if(data.inputId === 'up')
			player.move_up = data.state;
		else if(data.inputId === 'down')
			player.move_down = data.state;
	})

}

Player.onDisconnect = function(socket){
	
	delete Player.list[socket.id];
}

Player.update = function(){

	var package = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		package.push({
			x:player.x,
			y:player.y,
			number: player.name
		});
	}

	return package;
}

var validateUser = function(data, cb){
	
	db.account.find({username:data.username, password:data.password}, function(err, res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}

var usernameTaken = function(data, cb){
	
	db.account.find({username:data.username}, function(err, res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}

var addUser = function(data, cb){
	
	db.account.insert({username:data.username, password:data.password}, function(err){
		cb();
	});
}

io.sockets.on('connection', function(socket){
	
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	
	socket.on('signUp', function(data){
		usernameTaken(data, function(res){
			if(res){
				socket.emit('signUpResponse', {success:false});
			}
			else{
				addUser(data, function(){
					socket.emit('signUpResponse', {success:true});
				});	
			}
		});
	});

	socket.on('signIn', function(data){
		console.log("Sign in request!");
		validateUser(data, function(res){
			if(res){
				Player.onConnect(socket, data.username);
				socket.emit('signInResponse', {success:true});
			}
			else{
				socket.emit('signInResponse', {success:false});	
			}	
		});
		
	});
	
	console.log('Connection established with: ' + socket.id);


	socket.on('sendMsgToServer', function(data){
		var player_name = data.username;
		// var player_name = ("" + socket.id).slice(2,7);
		if(data.msg[0] == "@"){
			var to_name = data.msg.split(" ")[0].slice(1,);
			var socket_id = -1;
			for(var i in Player.list){
				var p = Player.list[i];
				if(p.name == to_name){
					socket_id = p.id;
					break;
				}
			}

			if(socket_id !== -1){
				SOCKET_LIST[socket_id].emit('addToChat', player_name + ' (Private): ' + data.msg.slice(to_name.length+2,));
				SOCKET_LIST[socket.id].emit('addToChat', player_name + ' (Private @' + to_name + '): ' + data.msg.slice(to_name.length+2,));
			}

			else
				SOCKET_LIST[socket.id].emit('addToChat', 'User "' + to_name + '" is not present in the field.');
		}

		else{
			for(var i in SOCKET_LIST){
				SOCKET_LIST[i].emit('addToChat', player_name + ': ' + data.msg);
			}
		}
	});

	socket.on('window_shape', function(data){
		window_height = data.height;
		window_width = data.width;
	});


	socket.on('join-room', (roomId, userId, username) => {
		socket.join(roomId)
		// Player.list[socket.id].userId = userId;
		for(var i in Player.list){
			var p = Player.list[i];
			if(p.name == username){
				console.log("Found p " + username)
				p.userId = userId;
			}
		}

		console.log("ENtered join room: " + roomId + " : " + userId)
		// socket.broadcast.emit('user-connected', userId)
		console.log("After")
	
		socket.on('disconnect', () => {
		  socket.broadcast.emit('user-disconnected', userId)
		  delete SOCKET_LIST[socket.id];
		  Player.onDisconnect(socket);
		})
	})

})


setInterval(function(){

	var package = {player: Player.update()}

	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('newPositions', package);
	}

}, 1000/100);
