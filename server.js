const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── In-memory poll storage ─────────────────────────────────────────────────
const polls = {};

// ── Question pool ──────────────────────────────────────────────────────────
const QUESTIONS = [
  // Animals
  'Cats', 'Dogs', 'Birds', 'Spiders', 'Fish', 'Pigeons', 'Bugs',
  // Activities
  'Driving', 'Parking', 'Swimming', 'Running', 'Cooking', 'Cleaning',
  'Napping', 'Dancing', 'Whistling', 'Shopping', 'Hiking', 'Stretching',
  // Communication & tech
  'Texting', 'Voicemails', 'Passwords', 'Wi-Fi', 'Charging', 'Autocorrect',
  'Notifications', 'Eye Contact', 'Small Talk', 'Waving',
  // Food & drink
  'Leftovers', 'Condiments', 'Ice Cream', 'Coffee', 'Buffets', 'Coupons',
  // Entertainment
  'Spoilers', 'Commercials', 'Subtitles', 'Reality TV', 'Sequels',
  // Situations & places
  'Traffic', 'Silence', 'Mondays', 'Birthdays', 'Airports', 'Elevators',
  'Darkness', 'Mornings', 'Rain', 'Crowds', 'Waiting', 'Deadlines',
  'Surprises', 'Mirrors', 'Clocks', 'Receipts',
  // Abstract / vibes
  'Superstitions', 'Nostalgia', 'Fonts', 'Tipping', 'Directions',
  'Bubble Wrap', 'Candles', 'Sunsets', 'Déjà Vu', 'Hugging',
];

const QUESTIONS_PER_POLL = QUESTIONS.length;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── API Routes ─────────────────────────────────────────────────────────────

app.post('/api/create', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const id = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
  const questions = shuffle(QUESTIONS)
    .slice(0, QUESTIONS_PER_POLL)
    .map(text => ({
      text,
      votes: { normal: 0, odd: 0 },
      comments: { normal: [], odd: [] },
    }));

  polls[id] = { id, name: name.trim(), questions, createdAt: Date.now() };
  res.json({ id, name: polls[id].name });
});

app.get('/api/poll/:id', (req, res) => {
  const poll = polls[req.params.id.toUpperCase()];
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json(poll);
});

// ── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', socket => {
  socket.on('join', ({ pollId }) => {
    const id = pollId?.toUpperCase();
    const poll = polls[id];
    if (!poll) { socket.emit('err', 'Poll not found'); return; }
    socket.join(id);
    socket.emit('poll', poll);
  });

  socket.on('vote', ({ pollId, qIndex, choice, comment, name }) => {
    const id = pollId?.toUpperCase();
    const poll = polls[id];
    if (!poll) return;

    const q = poll.questions[qIndex];
    if (!q || !['normal', 'odd'].includes(choice)) return;

    q.votes[choice]++;
    if (comment?.trim()) {
      q.comments[choice].push({
        text: comment.trim().slice(0, 200),
        name: (name?.trim() || 'Anonymous').slice(0, 30),
        id: Date.now(),
      });
    }

    io.to(id).emit('update', { qIndex, votes: q.votes, comments: q.comments });
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Odditor running at http://localhost:${PORT}\n`);
});
