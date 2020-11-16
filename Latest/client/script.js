// const videoGrid = document.getElementById('video-grid')
// const myPeer = new Peer(undefined, {
//   host: '/',
//   port: '3001'
// })
// const myVideo = document.createElement('video')

// myVideo.muted = true
// const peers = {}
// navigator.mediaDevices.getUserMedia({
//   video: true,
//   audio: true
// }).then(stream => {
//   addVideoStream(myVideo, stream)
//   myPeer.on('call', call => {
//     call.answer(stream)
// 	  console.log("connecting stream object:" + stream)
//     const video2 = document.createElement('video')
//     call.on('stream', userVideoStream => {
//       addVideoStream(video2, userVideoStream)
		
//     })
//   })



//   socket.on('user-connected', userId => {
//     console.log("user-connected : User ID" + userId)
//     connectToNewUser(userId, stream)
//   })
// })



// socket.on('user-disconnected', userId => {
//   if (peers[userId]) peers[userId].close()
// })

// myPeer.on('open', id => {
//   console.log("join room called for " + ROOM_ID + ":" + id)
//   socket.emit('join-room', ROOM_ID, id)
// })


function connectToNewUser(userId, stream, myPeer) {
  console.log("Inside connectnewuser, " + userId + " : " + stream + " : " + myPeer)
  const call = myPeer.call(userId, stream)
  const video = document.createElement('video')
  console.log("connect a new user:" + userId)
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream)
  })
  call.on('close', () => {
    video.remove()
  })

  peers[userId] = call
}

function addVideoStream(video, stream, videoGrid) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    console.log("Got here!!!!!")
    video.play()
  })
  console.log("Adding video:" + video + "video grid:" + videoGrid)
  videoGrid.append(video)
}