const API_BASE = "http://localhost:5000/api/v1/users";

// token helpers
const token = () => localStorage.getItem('token');
const authHeaders = () => ({ 
  Authorization: `Bearer ${token()}`, 
  'Content-Type': 'application/json' 
});

async function loadProfileAndRender() {
  const t = token();
  if (!t) return window.location.href = 'login.html';

  try {
    const res = await fetch(`${API_BASE}/me`, { 
      headers: { Authorization: `Bearer ${t}` } 
    });
    if (!res.ok) {
      localStorage.removeItem('token');
      return window.location.href = 'customerDashboard.html';
    }
    const user = await res.json();
    renderProfile(user);
    renderRoleArea(user.role);
    setupProfileForms(user);
  } catch (err) {
    console.error(err);
    localStorage.removeItem('token');
    window.location.href = 'customerDashboard.html';
  }
}

// function renderProfile(user) {
//   const box = document.getElementById('profileBox');
//   box.innerHTML = `
//     <h2>Welcome, ${user.name}</h2>
//     <p><strong>Email:</strong> ${user.email}</p>
//     <p><strong>Role:</strong> ${user.role}</p>
//     <p><strong>Phone:</strong> ${user.phone || '—'}</p>
//   `;
// }

// function renderRoleArea(role) {
//   const area = document.getElementById('roleArea');
//   area.innerHTML = ''; // clear
//   if (role === 'admin') {
//     area.innerHTML = `
//       <h3>Admin Panel</h3>
//       <button id="loadUsersBtn">Load All Users</button>
//       <div id="adminUsers"></div>
//     `;
//     document.getElementById('loadUsersBtn').addEventListener('click', loadAllUsers);
//   } else if (role === 'staff') {
//     area.innerHTML = `
//       <h3>Staff Tasks</h3>
//       <button id="loadTasksBtn">Load Tasks</button>
//       <div id="staffTasks"></div>
//     `;
//     document.getElementById('loadTasksBtn').addEventListener('click', loadStaffTasks);
//   } else {
//     area.innerHTML = `
//       <h3>Customer Area</h3>
//       <p>Place orders, view subscriptions, etc. (placeholder)</p>
//     `;
//   }
// }

// async function loadAllUsers() {
//   try {
//     const res = await fetch(`${API_BASE}/users/admin/users`, { 
//       headers: authHeaders() 
//     });
//     const data = await res.json();
//     if (!res.ok) return alert(data.message || 'Error');
//     const container = document.getElementById('adminUsers');
//     container.innerHTML = data.users.map(u => 
//       `<div>${u.name} — ${u.email} — ${u.role}</div>`
//     ).join('');
//   } catch (err) { 
//     console.error(err); 
//     alert('Error loading users'); 
//   }
// }

// async function loadStaffTasks() {
//   try {
//     const res = await fetch(`${API_BASE}/users/staff/tasks`, { 
//       headers: authHeaders() 
//     });
//     const data = await res.json();
//     if (!res.ok) return alert(data.message || 'Error');
//     const container = document.getElementById('staffTasks');
//     container.innerHTML = data.tasks.map(t => 
//       `<div>${t.title}</div>`
//     ).join('');
//   } catch (err) { 
//     console.error(err); 
//     alert('Error loading tasks'); 
//   }
// }

// function setupProfileForms(user) {
//   document.getElementById('editName').value = user.name || '';
//   document.getElementById('editEmail').value = user.email || '';
//   document.getElementById('editPhone').value = user.phone || '';

//   document.getElementById('profileForm').addEventListener('submit', async (e) => {
//     e.preventDefault();
//     const body = {
//       name: document.getElementById('editName').value,
//       email: document.getElementById('editEmail').value,
//       phone: document.getElementById('editPhone').value
//     };
//     try {
//       const res = await fetch(`${API_BASE}/users/profile`, {
//         method: 'PUT',
//         headers: authHeaders(),
//         body: JSON.stringify(body)
//       });
//       const data = await res.json();
//       if (res.ok) {
//         alert('Profile updated');
//         loadProfileAndRender();
//       } else {
//         alert(data.message || 'Error updating profile');
//       }
//     } catch (err) {
//       console.error(err);
//       alert('Error updating profile');
//     }
//   });

//   document.getElementById('passwordForm').addEventListener('submit', async (e) => {
//     e.preventDefault();
//     const body = {
//       currentPassword: document.getElementById('currentPassword').value,
//       newPassword: document.getElementById('newPassword').value
//     };
//     try {
//       const res = await fetch(`${API_BASE}/users/change-password`, {
//         method: 'PUT',
//         headers: authHeaders(),
//         body: JSON.stringify(body)
//       });
//       const data = await res.json();
//       if (res.ok) {
//         alert('Password changed successfully');
//         document.getElementById('passwordForm').reset();
//       } else {
//         alert(data.message || 'Error changing password');
//       }
//     } catch (err) {
//       console.error(err);
//       alert('Error changing password');
//     }
//   });
// }

// function logout() {
//   localStorage.removeItem('token');
//   window.location.href = 'login.html';
// }

// // Add event listener for logout button
// document.addEventListener('DOMContentLoaded', function() {
//   const logoutBtn = document.getElementById('logoutBtn');
//   if (logoutBtn) {
//     logoutBtn.addEventListener('click', logout);
//   }
  
//   // Load profile on page load
//   loadProfileAndRender();
// });