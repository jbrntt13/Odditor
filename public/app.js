/* ── Odditor Client ──────────────────────────────────────────────────────── */

const socket = io();

// ── State ─────────────────────────────────────────────────────────────────
const S = {
  view: 'home',
  poll: null,
  pollId: null,
  voterName: '',
  currentQ: 0,
  selectedVote: null,   // 'normal' | 'odd'
  myVotes: [],          // { choice, comment }[]
  votes: [],            // live { votes, comments } per question index
};

const app = document.getElementById('app');

// ── Utilities ──────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function liveVoteData(idx) {
  return S.votes[idx] || { votes: { normal: 0, odd: 0 }, comments: { normal: [], odd: [] } };
}

// ── Routing / URL params ───────────────────────────────────────────────────
function boot() {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    S.pollId = joinCode.toUpperCase();
    render('join');
  } else {
    render('home');
  }
}

// ── Main render ────────────────────────────────────────────────────────────
function render(view) {
  S.view = view;
  app.innerHTML = '';
  app.appendChild(buildHeader());

  const views = {
    home:    buildHome,
    create:  buildCreate,
    created: buildCreated,
    join:    buildJoin,
    voting:  buildVoting,
    results: buildResults,
  };

  const builder = views[view];
  if (builder) app.appendChild(builder());
}

// ── Header ─────────────────────────────────────────────────────────────────
function buildHeader() {
  const h = document.createElement('header');
  h.className = 'site-header';
  h.innerHTML = `<div class="logo">ODD<span>itor</span></div>`;
  h.onclick = () => render('home');
  return h;
}

// ── HOME ───────────────────────────────────────────────────────────────────
function buildHome() {
  const div = document.createElement('div');
  div.className = 'home-view anim-fade';
  div.innerHTML = `
    <p class="home-tagline">
      Make a poll about yourself. Send it to your friends.<br>Let them decide just how weird you really are.
    </p>
    <div class="home-actions">
      <button class="btn btn-primary" id="btnCreate">&#127917; Make My Poll</button>
      <button class="btn btn-ghost"   id="btnJoin">&#128505; Vote on a Friend</button>
    </div>
  `;
  div.querySelector('#btnCreate').onclick = () => render('create');
  div.querySelector('#btnJoin').onclick   = () => render('join');
  return div;
}

// ── CREATE ─────────────────────────────────────────────────────────────────
function buildCreate() {
  const div = document.createElement('div');
  div.className = 'form-view anim-slide';
  div.innerHTML = `
    <div class="card form-card">
      <h2>Create Your Poll</h2>
      <p class="sub">We'll pick 10 random habits &amp; quirks and ask your friends to judge: Normal or Odd?</p>
      <div class="form-group">
        <label>Your first name</label>
        <input type="text" id="inpName" placeholder='e.g. "Alex"' maxlength="30" autocomplete="off">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" id="btnBack">&#8592; Back</button>
        <button class="btn btn-primary" id="btnGo">Generate Poll &#8594;</button>
      </div>
    </div>
  `;

  const inp = div.querySelector('#inpName');
  div.querySelector('#btnBack').onclick = () => render('home');
  div.querySelector('#btnGo').onclick = () => {
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    doCreatePoll(name);
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') div.querySelector('#btnGo').click(); });
  setTimeout(() => inp.focus(), 50);
  return div;
}

async function doCreatePoll(name) {
  try {
    const res  = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    S.pollId   = data.id;
    S.poll     = { name: data.name, questions: [] };
    render('created');
  } catch {
    alert('Something went wrong — please try again.');
  }
}

// ── CREATED / SHARE ────────────────────────────────────────────────────────
function buildCreated() {
  const link = `${location.origin}?join=${S.pollId}`;

  const div = document.createElement('div');
  div.className = 'created-view anim-slide';
  div.innerHTML = `
    <h2>Your poll is live, ${esc(S.poll.name)}!</h2>
    <p class="sub">Share this code with your friends and let the judgement begin.</p>

    <div class="poll-code-wrap">
      <div class="poll-code-label">Poll Code</div>
      <div class="poll-code">${esc(S.pollId)}</div>
    </div>

    <div class="created-actions">
      <button class="btn btn-primary" id="btnCopy">&#128203; Copy Link</button>
      <button class="btn btn-ghost"   id="btnResults">&#128202; See My Results</button>
    </div>
    <div class="copy-msg" id="copyMsg"></div>

    <p class="created-hint">
      Friends go to this site and enter your code — or just paste them the link.
      Results update live as votes come in!
    </p>
  `;

  div.querySelector('#btnCopy').onclick = () => {
    navigator.clipboard.writeText(link).then(() => {
      div.querySelector('#copyMsg').textContent = '✓ Link copied to clipboard!';
      setTimeout(() => { div.querySelector('#copyMsg').textContent = ''; }, 3000);
    });
  };

  div.querySelector('#btnResults').onclick = () => doLoadPoll(S.pollId, true);

  return div;
}

// ── JOIN ───────────────────────────────────────────────────────────────────
function buildJoin() {
  const div = document.createElement('div');
  div.className = 'form-view anim-slide';
  div.innerHTML = `
    <div class="card form-card">
      <h2>Join a Poll</h2>
      <p class="sub">Enter the code your friend shared to start judging their life choices.</p>
      <div class="form-group">
        <label>Poll Code</label>
        <input type="text" id="inpCode"
          placeholder="ABC123"
          maxlength="6"
          value="${esc(S.pollId || '')}"
          autocomplete="off"
          style="text-transform:uppercase; font-family:'Bangers',cursive; font-size:1.8rem; letter-spacing:6px; text-align:center;">
      </div>
      <div class="form-group">
        <label>Your Name</label>
        <input type="text" id="inpVoter" placeholder='e.g. "Jordan"' maxlength="25" autocomplete="off">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost"   id="btnBack">&#8592; Back</button>
        <button class="btn btn-primary" id="btnVote">Let's Vote &#8594;</button>
      </div>
    </div>
  `;

  const inpCode  = div.querySelector('#inpCode');
  const inpVoter = div.querySelector('#inpVoter');

  inpCode.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });

  div.querySelector('#btnBack').onclick = () => render('home');
  div.querySelector('#btnVote').onclick = () => {
    const code = inpCode.value.trim().toUpperCase();
    const name = inpVoter.value.trim();
    if (!code)  { inpCode.focus();  return; }
    if (!name)  { inpVoter.focus(); return; }
    S.pollId    = code;
    S.voterName = name;
    doLoadPoll(code, false);
  };

  if (!S.pollId) setTimeout(() => inpCode.focus(), 50);
  else           setTimeout(() => inpVoter.focus(), 50);

  return div;
}

// ── Load poll from server ──────────────────────────────────────────────────
async function doLoadPoll(pollId, isHost) {
  try {
    const res = await fetch(`/api/poll/${pollId}`);
    if (!res.ok) { alert('Poll not found — double-check the code!'); return; }
    const poll = await res.json();

    S.poll       = poll;
    S.pollId     = poll.id;
    S.votes      = poll.questions.map(q => ({
      votes:    { ...q.votes },
      comments: { normal: [...q.comments.normal], odd: [...q.comments.odd] },
    }));
    S.currentQ      = 0;
    S.selectedVote  = null;
    S.myVotes       = [];

    socket.emit('join', { pollId: poll.id });

    if (isHost) render('results');
    else        render('voting');
  } catch {
    alert('Something went wrong — please try again.');
  }
}

// ── VOTING ─────────────────────────────────────────────────────────────────
function buildVoting() {
  if (!S.poll || !S.poll.questions.length) return buildErrorView('No poll loaded.');

  const q        = S.poll.questions[S.currentQ];
  const vd       = liveVoteData(S.currentQ);
  const answered = S.myVotes.length;
  const canFinish = answered >= 10;

  const div = document.createElement('div');
  div.className = 'voting-view';
  div.innerHTML = `
    <!-- Header bar -->
    <div class="voting-header">
      <div class="voting-meta">Rating: <strong>${esc(S.poll.name)}</strong></div>
      ${canFinish ? `<button class="btn-see-results" id="btnSeeResults">See Results</button>` : `<div></div>`}
      <div class="voting-progress-label">${answered} answered</div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar" style="width:${pct}%"></div>
    </div>

    <!-- Main 3-column body -->
    <div class="voting-body">
      <!-- Normal panel -->
      <div class="comment-panel panel-normal" id="panelNormal">
        <div class="panel-title">&#10003; NORMAL</div>
        <div class="panel-count" id="cntNormal">${vd.votes.normal}</div>
        <div class="panel-divider"></div>
        ${renderCommentList(vd.comments.normal, 'normal', true)}
      </div>

      <!-- Question center -->
      <div class="question-panel">
        <div class="q-label">Question ${S.currentQ + 1}</div>
        <div class="q-prefix">${esc(S.poll.name)}'s thing with</div>
        <div class="q-topic">${esc(q.text)}</div>

        <!-- Submit always visible, disabled until a choice is made -->
        <button class="btn-submit" id="btnSubmit" disabled>Submit</button>

        <div class="vote-btns">
          <button class="btn btn-normal" id="btnNormal">&#10003; Normal</button>
          <button class="btn btn-odd"   id="btnOdd">&#9889; Odd</button>
        </div>

        <!-- Comment box appears after a choice is made -->
        <div class="comment-box hidden" id="commentBox">
          <textarea id="commentInput" rows="3"
            placeholder="Add a comment explaining your take… (optional)"></textarea>
        </div>
      </div>

      <!-- Odd panel -->
      <div class="comment-panel panel-odd" id="panelOdd">
        <div class="panel-title">&#9889; ODD</div>
        <div class="panel-count" id="cntOdd">${vd.votes.odd}</div>
        <div class="panel-divider"></div>
        ${renderCommentList(vd.comments.odd, 'odd', true)}
      </div>
    </div>

    <!-- Mobile comment strip -->
    <div class="mobile-comments">
      <div class="mobile-col" id="mobileNormal">
        <div class="mobile-col-title" style="color:var(--normal)">
          &#10003; NORMAL (${vd.votes.normal})
        </div>
        ${vd.comments.normal.length
          ? renderCommentList(vd.comments.normal, 'normal', false)
          : '<div class="panel-empty">No takes yet…</div>'}
      </div>
      <div class="mobile-col" id="mobileOdd">
        <div class="mobile-col-title" style="color:var(--odd)">
          &#9889; ODD (${vd.votes.odd})
        </div>
        ${vd.comments.odd.length
          ? renderCommentList(vd.comments.odd, 'odd', false)
          : '<div class="panel-empty">No takes yet…</div>'}
      </div>
    </div>
  `;

  // Wire up buttons
  div.querySelector('#btnNormal').onclick = () => selectVote('normal');
  div.querySelector('#btnOdd').onclick    = () => selectVote('odd');
  div.querySelector('#btnSubmit').onclick = () => submitVote();
  const btnSee = div.querySelector('#btnSeeResults');
  if (btnSee) btnSee.onclick = () => render('results');

  // Re-apply visual state if already voted (e.g. after live-update re-render edge case)
  if (S.selectedVote) {
    applyVoteUI(S.selectedVote);
    div.querySelector('#btnSubmit').disabled = false;
    div.querySelector('#commentBox').classList.remove('hidden');
  }

  return div;
}

function renderCommentList(comments, type, showEmpty) {
  if (!comments.length) {
    return showEmpty ? '<div class="panel-empty">No takes yet…</div>' : '';
  }
  return comments.map(c => `
    <div class="comment-item">
      <div class="comment-name">${esc(c.name)}</div>
      <div class="comment-text">${esc(c.text)}</div>
    </div>
  `).join('');
}

// ── Vote interaction ───────────────────────────────────────────────────────
function selectVote(choice) {
  S.selectedVote = choice;
  applyVoteUI(choice);

  const btn = document.getElementById('btnSubmit');
  if (btn) btn.disabled = false;

  const box = document.getElementById('commentBox');
  if (box) box.classList.remove('hidden');
}

function applyVoteUI(choice) {
  const btnN = document.getElementById('btnNormal');
  const btnO = document.getElementById('btnOdd');
  if (!btnN || !btnO) return;

  if (choice === 'normal') {
    btnN.classList.add('selected');   btnN.classList.remove('dimmed');
    btnO.classList.add('dimmed');     btnO.classList.remove('selected');
  } else {
    btnO.classList.add('selected');   btnO.classList.remove('dimmed');
    btnN.classList.add('dimmed');     btnN.classList.remove('selected');
  }
}

function submitVote() {
  if (!S.selectedVote) return;

  const commentEl = document.getElementById('commentInput');
  const comment   = commentEl ? commentEl.value.trim() : '';

  // Record locally
  S.myVotes.push({ choice: S.selectedVote, comment });

  // Tell server
  socket.emit('vote', {
    pollId:  S.pollId,
    qIndex:  S.currentQ,
    choice:  S.selectedVote,
    comment,
    name:    S.voterName,
  });

  // Optimistically update local vote data
  const vd = S.votes[S.currentQ];
  if (vd) {
    vd.votes[S.selectedVote]++;
    if (comment) {
      vd.comments[S.selectedVote].push({ text: comment, name: S.voterName, id: Date.now() });
    }
  }

  // Advance to next question, or go to results if pool exhausted
  if (S.currentQ < S.poll.questions.length - 1) {
    S.currentQ++;
    S.selectedVote = null;
    render('voting');
  } else {
    render('results');
  }

}

// ── Live panel update (no full re-render) ──────────────────────────────────
function patchVotingPanels(qIndex, votes, comments) {
  if (S.view !== 'voting' || S.currentQ !== qIndex) return;

  // Counts
  const cN = document.getElementById('cntNormal');
  const cO = document.getElementById('cntOdd');
  if (cN) cN.textContent = votes.normal;
  if (cO) cO.textContent = votes.odd;

  // Desktop panels
  patchPanel('panelNormal', comments.normal, 'normal');
  patchPanel('panelOdd',    comments.odd,    'odd');

  // Mobile strips
  patchMobile('mobileNormal', votes.normal, comments.normal, 'normal');
  patchMobile('mobileOdd',    votes.odd,    comments.odd,    'odd');
}

function patchPanel(id, comments, type) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.querySelectorAll('.comment-item, .panel-empty').forEach(el => el.remove());
  if (!comments.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent = 'No takes yet…';
    panel.appendChild(empty);
  } else {
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `<div class="comment-name">${esc(c.name)}</div><div class="comment-text">${esc(c.text)}</div>`;
      panel.appendChild(item);
    });
  }
}

function patchMobile(id, count, comments, type) {
  const col = document.getElementById(id);
  if (!col) return;
  const icon  = type === 'normal' ? '&#10003;' : '&#9889;';
  const color = type === 'normal' ? 'var(--normal)' : 'var(--odd)';
  const label = type === 'normal' ? 'NORMAL' : 'ODD';
  col.innerHTML = `
    <div class="mobile-col-title" style="color:${color}">${icon} ${label} (${count})</div>
    ${comments.length ? renderCommentList(comments, type, false) : '<div class="panel-empty">No takes yet…</div>'}
  `;
}

// ── RESULTS ────────────────────────────────────────────────────────────────
function buildResults() {
  if (!S.poll || !S.poll.questions) return buildErrorView('No poll loaded.');

  const questions = S.poll.questions;
  let totalOdd = 0, totalVotes = 0;

  S.votes.forEach(vd => {
    totalOdd   += vd.votes.odd;
    totalVotes += vd.votes.normal + vd.votes.odd;
  });

  const oddPct = totalVotes > 0 ? Math.round((totalOdd / totalVotes) * 100) : 0;

  const div = document.createElement('div');
  div.className = 'results-view anim-fade';
  div.innerHTML = `
    <div class="results-hero">
      <div class="results-score">${oddPct}%</div>
      <div class="results-verdict">
        of votes say <em class="results-name">${esc(S.poll.name)}</em>
        is <strong style="color:var(--odd)">Odd</strong>
      </div>
      <div class="results-vote-count">${totalVotes} total vote${totalVotes !== 1 ? 's' : ''} cast</div>
    </div>

    <div class="results-grid">
      ${questions.map((q, i) => buildResultCard(q, S.votes[i], i)).join('')}
    </div>

    <div class="results-back">
      <button class="btn btn-ghost" id="btnHome">&#8592; Back to Home</button>
    </div>
  `;

  div.querySelector('#btnHome').onclick = () => render('home');
  return div;
}

function buildResultCard(q, vd, i) {
  const total     = vd.votes.normal + vd.votes.odd;
  const normPct   = total > 0 ? Math.round((vd.votes.normal / total) * 100) : 0;
  const oddPct    = total > 0 ? 100 - normPct : 0;
  const allComments = [
    ...vd.comments.normal.map(c => ({ ...c, type: 'normal' })),
    ...vd.comments.odd.map(c => ({ ...c, type: 'odd' })),
  ];

  return `
    <div class="result-card">
      <div class="result-q-text">
        <span class="result-q-prefix">${esc(S.poll.name)}'s thing with</span>
        ${esc(q.text)}
      </div>

      <div class="result-bar-row">
        <div class="result-bar-tag normal">NORMAL</div>
        <div class="result-bar-track">
          <div class="result-bar-fill normal" style="width:${normPct}%">
            ${vd.votes.normal > 0 ? vd.votes.normal : ''}
          </div>
        </div>
        <div class="result-bar-pct normal">${normPct}%</div>
      </div>

      <div class="result-bar-row">
        <div class="result-bar-tag odd">ODD</div>
        <div class="result-bar-track">
          <div class="result-bar-fill odd" style="width:${oddPct}%">
            ${vd.votes.odd > 0 ? vd.votes.odd : ''}
          </div>
        </div>
        <div class="result-bar-pct odd">${oddPct}%</div>
      </div>

      ${allComments.length ? `
        <div class="result-comments-grid">
          ${allComments.map(c => `
            <div class="result-comment ${c.type}">
              <strong>${esc(c.name)}</strong>${esc(c.text)}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Error view ─────────────────────────────────────────────────────────────
function buildErrorView(msg) {
  const div = document.createElement('div');
  div.className = 'error-view anim-fade';
  div.innerHTML = `
    <h2>Whoops!</h2>
    <p>${esc(msg)}</p>
    <button class="btn btn-ghost" onclick="render('home')">&#8592; Back to Home</button>
  `;
  return div;
}

// ── Socket events ──────────────────────────────────────────────────────────
socket.on('poll', poll => {
  // Refresh live state with server's current data
  S.poll  = poll;
  S.votes = poll.questions.map(q => ({
    votes:    { ...q.votes },
    comments: { normal: [...q.comments.normal], odd: [...q.comments.odd] },
  }));
});

socket.on('update', ({ qIndex, votes, comments }) => {
  // Update local live data
  if (S.votes[qIndex]) {
    S.votes[qIndex].votes    = votes;
    S.votes[qIndex].comments = comments;
  }

  if (S.view === 'voting') {
    patchVotingPanels(qIndex, votes, comments);
  } else if (S.view === 'results') {
    // Soft re-render results (comments/bars update)
    if (S.poll) render('results');
  }
});

socket.on('err', msg => alert(`Error: ${msg}`));

// ── Boot ───────────────────────────────────────────────────────────────────
boot();
