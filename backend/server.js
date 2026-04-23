const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let waitingUser = null;

// Map of socket.id -> partner's socket.id
const activeMatches = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_queue', () => {
    // If the user is already matched or waiting, ignore
    if (activeMatches.has(socket.id) || waitingUser === socket) {
      return;
    }

    if (waitingUser) {
      // Match found
      const partner = waitingUser;
      waitingUser = null;

      activeMatches.set(socket.id, partner.id);
      activeMatches.set(partner.id, socket.id);

      // Notify both
      socket.emit('matched', { partnerId: partner.id, initiator: true });
      partner.emit('matched', { partnerId: socket.id, initiator: false });
    } else {
      // Wait
      waitingUser = socket;
    }
  });

  socket.on('leave_chat', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    handleDisconnect(socket);
  });

  // WebRTC Signaling
  socket.on('offer', (data) => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('offer', data);
    }
  });

  socket.on('answer', (data) => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('answer', data);
    }
  });

  socket.on('ice_candidate', (data) => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('ice_candidate', data);
    }
  });

  // Chat Messaging
  socket.on('send_message', (message) => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('receive_message', message);
    }
  });
});

function handleDisconnect(socket) {
  if (waitingUser === socket) {
    waitingUser = null;
    return;
  }

  const partnerId = activeMatches.get(socket.id);
  if (partnerId) {
    activeMatches.delete(socket.id);
    activeMatches.delete(partnerId);
    
    // Notify partner
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('partner_left');
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
