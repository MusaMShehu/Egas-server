const apiBase = "http://localhost:5000/api/users";

// ===== Registration =====
async function registerUser(e) {
  e.preventDefault();
  const userData = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    role: document.getElementById("role").value,
    phone: document.getElementById("phone").value
  };
  const res = await fetch(${apiBase}/register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData)
  });
  const data = await res.json();
  document.getElementById("message").innerText = data.message || "Registered successfully!";
}

// ===== Login =====
async function loginUser(e) {
  e.preventDefault();
  const loginData = {
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value
  };
  const res = await fetch(${apiBase}/login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginData)
  });
  const data = await res.json();
  if (res.ok) {
    localStorage.setItem("token", data.token);
    window.location.href = "profile.html";
  } else {
    document.getElementById("message").innerText = data.message || "Login failed";
  }
}

// ===== Load Profile & Addresses =====
async function loadProfile() {
  const token = localStorage.getItem("token");
  if (!token) return window.location.href = "login.html";

  const res = await fetch(${apiBase}/profile, {
    headers: { "Authorization": Bearer ${token} }
  });
  const data = await res.json();

  if (res.ok) {
    document.getElementById("profileInfo").innerHTML = `
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Role:</strong> ${data.role}</p>
    `;
    renderAddresses(data.addresses || []);
  } else {
    logout();
  }
}

// ===== Render Addresses =====
function renderAddresses(addresses) {
  const container = document.getElementById("addressList");
  container.innerHTML = "";
  if (addresses.length === 0) {
    container.innerHTML = "<p>No addresses yet.</p>";
    return;
  }
  addresses.forEach(addr => {
    const div = document.createElement("div");
    div.classList.add("address");
    div.innerHTML = `
      <strong>${addr.label}</strong><br>
      ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}<br>
      Coords: ${addr.coordinates?.lat || ""}, ${addr.coordinates?.lng || ""}<br>
      <button onclick="editAddress('${addr._id}', '${addr.label}', '${addr.street}', '${addr.city}', '${addr.state}', '${addr.zip}', '${addr.coordinates?.lat || ""}', '${addr.coordinates?.lng || ""}')">Edit</button>
      <button onclick="deleteAddress('${addr._id}')">Delete</button>
    `;
    container.appendChild(div);
  });
}

// ===== Edit Address =====
function editAddress(id, label, street, city, state, zip, lat, lng) {
  document.getElementById("addressId").value = id;
  document.getElementById("label").value = label;
  document.getElementById("street").value = street;
  document.getElementById("city").value = city;
  document.getElementById("state").value = state;
  document.getElementById("zip").value = zip;
  document.getElementById("lat").value = lat;
  document.getElementById("lng").value = lng;
}

// ===== Save Address =====
async function saveAddress(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  const addressId = document.getElementById("addressId").value;
  const addressData = {
    label: document.getElementById("label").value,
    street: document.getElementById("street").value,
    city: document.getElementById("city").value,
    state: document.getElementById("state").value,
    zip: document.getElementById("zip").value,
    coordinates: {
      lat: parseFloat(document.getElementById("lat").value) || null,
      lng: parseFloat(document.getElementById("lng").value) || null
    }
  };
  const url = addressId ? ${apiBase}/address/${addressId} : ${apiBase}/address;
  const method = addressId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": Bearer ${token} },
    body: JSON.stringify(addressData)
  });
  const data = await res.json();

  if (res.ok) {
    document.getElementById("addressForm").reset();
    loadProfile();
  } else {
    alert(data.message || "Error saving address");
  }
}

// ===== Delete Address =====
async function deleteAddress(addressId) {
  const token = localStorage.getItem("token");
  const res = await fetch(${apiBase}/address/${addressId}, {
    method: "DELETE",
    headers: { "Authorization": Bearer ${token} }
  });
  const data = await res.json();
  if (res.ok) loadProfile();
  else alert(data.message || "Error deleting address");
}

// ===== Logout =====
function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}