var express = require('express');
var app= express();
var server = require('http').Server(app)
var io = require('socket.io')(server,{});
var mongojs = require("mongojs");

var db = mongojs("localhost:27017/titans", ['account','additional_info']);

var SOCKET_LIST = {};

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
		self.x += self.spdX;
		self.y += self.spdY;
	}	

	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x, 2) + Math.pow(self.y-pt.y, 2));
	}

	return self;
}

var Player = function(id){

	var self = Entity();
	self.id = id;
	self.number = ""+ Math.floor(10 * Math.random());
	self.move_left = false;
	self.move_right = false;
	self.move_up = false;
	self.move_down = false;
	self.speed = 10;
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		super_update();

		// for(var i in Player.list){
		// 	var p = Player.list[i];
		// 	if(self.getDistance(p) < 64 && self.id !== p.id){
		// 		socket.emit('vicinity', 'p: ' + p.id);
		// 	}
		// }
	}

	self.updateSpd = function(){

		if(self.move_left)
			self.spdX -= self.speed;
		else if(self.move_right)
			self.spdX += self.speed;
		else
			self.spdX = 0;

		if(self.move_up)
			self.spdY -= self.speed;
		else if(self.move_down)
			self.spdY += self.speed;
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

app.use('/client', express.static(__dirname + '/client'));

server.listen(8000)

Player.onConnect = function(socket){
	var player = Player(socket.id);
	socket.on('keyPress', function(data){
		if(data.inputId === 'left')
			player.move_left = data.state;
		else if(data.inputId === 'right')
			player.move_right = data.state;
		else if(data.inputId === 'up')
			player.move_up = data.state;
		else if(data.inputId === 'down')
			player.move_down = data.state;
	});
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
			number: player.number
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
		validateUser(data, function(res){
			if(res){
				Player.onConnect(socket);
				socket.emit('signInResponse', {success:true});
			}
			else{
				socket.emit('signInResponse', {success:false});	
			}	
		});
		
	});
	
	console.log('Connection established with: ' + socket.id);

	socket.on('disconnect', function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});

	socket.on('sendMsgToServer', function(msg){
		var player_name = ("" + socket.id).slice(2,7);
		for(var i in SOCKET_LIST){
			SOCKET_LIST[i].emit('addToChat', player_name + ': ' + msg);
		}
	});

});

setInterval(function(){

	var package = {player: Player.update()}

	// var nearby = {neighbor: Player.checkNearby()}

	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('newPositions', package);
	}

}, 1000/25);