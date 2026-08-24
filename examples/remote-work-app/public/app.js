document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');
  const requestModal = document.getElementById('request-modal');
  const requestForm = document.getElementById('request-form');
  const requestsList = document.getElementById('requests-list');
  const btnNewRequest = document.getElementById('btn-new-request');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel');
  const btnLogout = document.getElementById('btn-logout');
  const userDisplay = document.getElementById('user-display');

  // In-memory state
  let currentUser = localStorage.getItem('auth_user') || null;
  let requests = JSON.parse(localStorage.getItem('remote_requests') || '[]');

  function updateView() {
    if (currentUser) {
      loginView.classList.add('hidden');
      dashboardView.classList.remove('hidden');
      userDisplay.textContent = currentUser;
      renderRequests();
    } else {
      loginView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
    }
  }

  function renderRequests() {
    requestsList.innerHTML = '';
    if (requests.length === 0) {
      requestsList.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No remote requests yet</td></tr>';
      return;
    }

    requests.forEach((req) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${req.id}</code></td>
        <td>${req.date}</td>
        <td>${req.reason}</td>
        <td><span class="status-badge ${req.status.toLowerCase()}">${req.status}</span></td>
      `;
      requestsList.appendChild(tr);
    });
  }

  // Handle Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    currentUser = email;
    localStorage.setItem('auth_user', email);
    // Set a session cookie for session verification
    document.cookie = `session_token=test_session_${Date.now()}; path=/; max-age=3600`;
    updateView();
  });

  // Handle Logout
  btnLogout.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('auth_user');
    updateView();
  });

  // Modal open/close
  btnNewRequest.addEventListener('click', () => {
    requestModal.classList.remove('hidden');
  });

  function closeModal() {
    requestModal.classList.add('hidden');
    requestForm.reset();
  }

  btnCloseModal.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  // Handle Request Submission
  requestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('request-date').value;
    const reason = document.getElementById('request-reason').value;

    const newRequest = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      date,
      reason,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    requests.unshift(newRequest);
    localStorage.setItem('remote_requests', JSON.stringify(requests));
    renderRequests();
    closeModal();
  });

  // Initial check
  updateView();
});
