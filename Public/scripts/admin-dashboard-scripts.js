// Base API URL - Update this to your backend API endpoint
const API_BASE_URL = 'https://your-api-endpoint.com/api';

// DOM Elements
const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
const logoutBtn = document.querySelector('.logout-btn');
const searchInputs = document.querySelectorAll('.search-input');
const addButtons = document.querySelectorAll('.add-btn');
const editButtons = document.querySelectorAll('.edit-btn');
const deleteButtons = document.querySelectorAll('.delete-btn');
const modals = document.querySelectorAll('.modal');
const closeButtons = document.querySelectorAll('.modal-close');
const saveButtons = document.querySelectorAll('.save-btn');
const cancelButtons = document.querySelectorAll('.cancel-btn');
const filterForms = document.querySelectorAll('.filter-form');
const exportButtons = document.querySelectorAll('.export-btn');

// Auth Token - This should be set after login
let authToken = localStorage.getItem('authToken') || '';

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Highlight active sidebar link
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    sidebarLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('bg-purple-700');
            link.classList.remove('hover:bg-purple-700');
        }
    });

    // Load data based on current page
    loadPageData(currentPage);

    // Initialize modals
    initModals();

    // Initialize event listeners
    initEventListeners();
});

// Load data based on current page
function loadPageData(page) {
    switch(page) {
        case 'users.html':
            fetchUsers();
            break;
        case 'orders.html':
            fetchOrders();
            break;
        case 'products.html':
            fetchProducts();
            break;
        case 'subscriptions.html':
            fetchSubscriptions();
            break;
        case 'reports.html':
            fetchReports();
            break;
        case 'settings.html':
            loadSettings();
            break;
        default:
            fetchDashboardStats();
    }
}

// Initialize modals
function initModals() {
    // Show modal when add/edit button is clicked
    addButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            showModal(modalId);
        });
    });

    // Close modal when X button is clicked
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal);
        });
    });

    // Close modal when cancel button is clicked
    cancelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal);
        });
    });

    // Close modal when clicking outside
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modal);
            }
        });
    });
}

// Initialize event listeners
function initEventListeners() {
    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Search functionality
    searchInputs.forEach(input => {
        input.addEventListener('input', debounce(() => {
            const tableId = input.getAttribute('data-table');
            const value = input.value.toLowerCase();
            filterTable(tableId, value);
        }, 300));
    });

    // Save buttons in modals
    saveButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const form = btn.closest('form');
            if (form) {
                const formId = form.id;
                handleFormSubmit(formId);
            }
        });
    });

    // Filter forms
    filterForms.forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formId = form.id;
            handleFilterSubmit(formId);
        });
    });

    // Export buttons
    exportButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const exportType = btn.getAttribute('data-export');
            exportData(exportType);
        });
    });
}

// Show modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// Hide modal
function hideModal(modal) {
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// Filter table rows based on search input
function filterTable(tableId, searchValue) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchValue) ? '' : 'none';
    });
}

// API Functions
async function makeApiRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };

    const options = {
        method,
        headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API request error:', error);
        showNotification('error', 'Failed to fetch data. Please try again.');
        throw error;
    }
}

// Data Fetching Functions
async function fetchDashboardStats() {
    try {
        const data = await makeApiRequest('/dashboard/stats');
        updateDashboardStats(data);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
    }
}

async function fetchUsers() {
    try {
        const data = await makeApiRequest('/users');
        renderUsersTable(data);
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

async function fetchOrders() {
    try {
        const data = await makeApiRequest('/orders');
        renderOrdersTable(data);
    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

async function fetchProducts() {
    try {
        const data = await makeApiRequest('/products');
        renderProductsTable(data);
    } catch (error) {
        console.error('Error fetching products:', error);
    }
}

async function fetchSubscriptions() {
    try {
        const data = await makeApiRequest('/subscriptions');
        renderSubscriptionsTable(data);
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
    }
}

async function fetchReports() {
    try {
        const data = await makeApiRequest('/reports');
        renderReports(data);
    } catch (error) {
        console.error('Error fetching reports:', error);
    }
}

async function loadSettings() {
    try {
        const data = await makeApiRequest('/settings');
        populateSettingsForm(data);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Data Rendering Functions
function updateDashboardStats(stats) {
    document.querySelector('.today-orders').textContent = stats.todayOrders;
    document.querySelector('.active-subscriptions').textContent = stats.activeSubscriptions;
    document.querySelector('.today-revenue').textContent = `₦${stats.todayRevenue.toLocaleString()}`;
    document.querySelector('.gas-stock').textContent = `${stats.gasStock}%`;
}

function renderUsersTable(users) {
    const tbody = document.querySelector('#users-table tbody');
    if (!tbody) return;

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.phone}</td>
            <td>${user.role}</td>
            <td><span class="status-badge ${user.status === 'active' ? 'status-active' : 'status-cancelled'}">${user.status}</span></td>
            <td>
                <button class="edit-btn" data-id="${user.id}" data-modal="edit-user-modal">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" data-id="${user.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Add event listeners to new buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.getAttribute('data-id');
            const modalId = btn.getAttribute('data-modal');
            loadUserData(userId, modalId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.getAttribute('data-id');
            confirmDelete('user', userId);
        });
    });
}

function renderOrdersTable(orders) {
    const tbody = document.querySelector('#orders-table tbody');
    if (!tbody) return;

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.orderId}</td>
            <td>${order.customerName}</td>
            <td>${order.date}</td>
            <td>₦${order.amount.toLocaleString()}</td>
            <td><span class="status-badge ${getOrderStatusClass(order.status)}">${order.status}</span></td>
            <td>${order.deliveryStaff || '-'}</td>
            <td>
                <button class="btn-icon view-btn" data-id="${order.id}" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon assign-btn" data-id="${order.id}" title="Assign">
                    <i class="fas fa-user-tag"></i>
                </button>
                <button class="btn-icon cancel-btn" data-id="${order.id}" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Add event listeners to new buttons
    initOrderActionButtons();
}

function renderProductsTable(products) {
    const tbody = document.querySelector('#products-table tbody');
    if (!tbody) return;

    tbody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td><img src="${product.image || 'placeholder.jpg'}" alt="${product.name}" class="product-image"></td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>₦${product.price.toLocaleString()}</td>
            <td>${product.stock}</td>
            <td><span class="status-badge ${product.stock > 0 ? 'status-active' : 'status-cancelled'}">${product.stock > 0 ? 'In Stock' : 'Out of Stock'}</span></td>
            <td>
                <button class="edit-btn" data-id="${product.id}" data-modal="edit-product-modal">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" data-id="${product.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Add event listeners to new buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const productId = btn.getAttribute('data-id');
            const modalId = btn.getAttribute('data-modal');
            loadProductData(productId, modalId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const productId = btn.getAttribute('data-id');
            confirmDelete('product', productId);
        });
    });
}

function renderSubscriptionsTable(subscriptions) {
    const tbody = document.querySelector('#subscriptions-table tbody');
    if (!tbody) return;

    tbody.innerHTML = subscriptions.map(sub => `
        <tr>
            <td>${sub.id}</td>
            <td>${sub.customerName}</td>
            <td>${sub.plan}</td>
            <td>${sub.startDate}</td>
            <td>${sub.nextDelivery}</td>
            <td><span class="status-badge ${sub.status === 'active' ? 'status-active' : sub.status === 'paused' ? 'status-pending' : 'status-cancelled'}">${sub.status}</span></td>
            <td>
                <button class="btn-icon view-btn" data-id="${sub.id}" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon pause-btn" data-id="${sub.id}" title="${sub.status === 'paused' ? 'Resume' : 'Pause'}">
                    <i class="fas ${sub.status === 'paused' ? 'fa-play' : 'fa-pause'}"></i>
                </button>
                <button class="btn-icon cancel-btn" data-id="${sub.id}" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Add event listeners to new buttons
    initSubscriptionActionButtons();
}

function renderReports(reportData) {
    // Update summary stats
    document.querySelector('.total-revenue').textContent = `₦${reportData.totalRevenue.toLocaleString()}`;
    document.querySelector('.new-subscriptions').textContent = reportData.newSubscriptions;
    document.querySelector('.avg-order-value').textContent = `₦${reportData.avgOrderValue.toLocaleString()}`;

    // Render top products table
    const tbody = document.querySelector('#top-products-table tbody');
    if (tbody) {
        tbody.innerHTML = reportData.topProducts.map(product => `
            <tr>
                <td>${product.name}</td>
                <td>${product.category}</td>
                <td>${product.unitsSold}</td>
                <td>₦${product.revenue.toLocaleString()}</td>
                <td>${product.percentage}%</td>
            </tr>
        `).join('');
    }

    // Initialize charts (you would use Chart.js or similar here)
    initCharts(reportData.chartData);
}

function populateSettingsForm(settings) {
    document.getElementById('business-name').value = settings.businessName;
    document.getElementById('contact-email').value = settings.contactEmail;
    document.getElementById('phone-number').value = settings.phoneNumber;
    document.getElementById('business-address').value = settings.businessAddress;
    // Populate other settings fields...
}

// Helper Functions
function getOrderStatusClass(status) {
    switch(status.toLowerCase()) {
        case 'processing': return 'status-processing';
        case 'shipped': return 'status-active';
        case 'delivered': return 'status-active';
        case 'cancelled': return 'status-cancelled';
        default: return 'status-pending';
    }
}

function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded shadow-lg text-white ${
        type === 'success' ? 'bg-green-500' : 
        type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    }`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function initOrderActionButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.getAttribute('data-id');
            viewOrderDetails(orderId);
        });
    });

    document.querySelectorAll('.assign-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.getAttribute('data-id');
            assignOrderToStaff(orderId);
        });
    });

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.getAttribute('data-id');
            cancelOrder(orderId);
        });
    });
}

function initSubscriptionActionButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const subId = btn.getAttribute('data-id');
            viewSubscriptionDetails(subId);
        });
    });

    document.querySelectorAll('.pause-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const subId = btn.getAttribute('data-id');
            toggleSubscriptionPause(subId);
        });
    });

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const subId = btn.getAttribute('data-id');
            cancelSubscription(subId);
        });
    });
}

// Form Handling
function handleFormSubmit(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    switch(formId) {
        case 'user-form':
            saveUser(data);
            break;
        case 'product-form':
            saveProduct(data);
            break;
        case 'settings-form':
            saveSettings(data);
            break;
        // Handle other forms...
    }
}

function handleFilterSubmit(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const formData = new FormData(form);
    const filters = Object.fromEntries(formData.entries());

    switch(formId) {
        case 'orders-filter':
            fetchFilteredOrders(filters);
            break;
        case 'subscriptions-filter':
            fetchFilteredSubscriptions(filters);
            break;
        // Handle other filters...
    }
}

// API Action Functions
async function saveUser(userData) {
    try {
        const endpoint = userData.id ? `/users/${userData.id}` : '/users';
        const method = userData.id ? 'PUT' : 'POST';
        
        await makeApiRequest(endpoint, method, userData);
        showNotification('success', 'User saved successfully');
        fetchUsers();
        hideModal(document.getElementById('user-modal'));
    } catch (error) {
        showNotification('error', 'Failed to save user');
    }
}

async function saveProduct(productData) {
    try {
        const endpoint = productData.id ? `/products/${productData.id}` : '/products';
        const method = productData.id ? 'PUT' : 'POST';
        
        await makeApiRequest(endpoint, method, productData);
        showNotification('success', 'Product saved successfully');
        fetchProducts();
        hideModal(document.getElementById('product-modal'));
    } catch (error) {
        showNotification('error', 'Failed to save product');
    }
}

async function saveSettings(settingsData) {
    try {
        await makeApiRequest('/settings', 'PUT', settingsData);
        showNotification('success', 'Settings saved successfully');
    } catch (error) {
        showNotification('error', 'Failed to save settings');
    }
}

async function confirmDelete(entityType, id) {
    if (confirm(`Are you sure you want to delete this ${entityType}?`)) {
        try {
            await makeApiRequest(`/${entityType}s/${id}`, 'DELETE');
            showNotification('success', `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} deleted successfully`);
            
            // Refresh the appropriate data
            switch(entityType) {
                case 'user':
                    fetchUsers();
                    break;
                case 'product':
                    fetchProducts();
                    break;
                // Handle other entity types...
            }
        } catch (error) {
            showNotification('error', `Failed to delete ${entityType}`);
        }
    }
}

async function loadUserData(userId, modalId) {
    try {
        const user = await makeApiRequest(`/users/${userId}`);
        const modal = document.getElementById(modalId);
        
        if (modal) {
            modal.querySelector('#user-id').value = user.id;
            modal.querySelector('#user-name').value = user.name;
            modal.querySelector('#user-email').value = user.email;
            modal.querySelector('#user-phone').value = user.phone;
            modal.querySelector('#user-role').value = user.role;
            modal.querySelector('#user-status').value = user.status;
            
            showModal(modalId);
        }
    } catch (error) {
        showNotification('error', 'Failed to load user data');
    }
}

async function loadProductData(productId, modalId) {
    try {
        const product = await makeApiRequest(`/products/${productId}`);
        const modal = document.getElementById(modalId);
        
        if (modal) {
            modal.querySelector('#product-id').value = product.id;
            modal.querySelector('#product-name').value = product.name;
            modal.querySelector('#product-category').value = product.category;
            modal.querySelector('#product-price').value = product.price;
            modal.querySelector('#product-stock').value = product.stock;
            modal.querySelector('#product-description').value = product.description;
            
            showModal(modalId);
        }
    } catch (error) {
        showNotification('error', 'Failed to load product data');
    }
}

async function viewOrderDetails(orderId) {
    try {
        const order = await makeApiRequest(`/orders/${orderId}`);
        // Show order details in a modal or dedicated page
        console.log('Order details:', order);
        // You would implement the actual display logic here
    } catch (error) {
        showNotification('error', 'Failed to load order details');
    }
}

async function assignOrderToStaff(orderId) {
    // Implement order assignment logic
}

async function cancelOrder(orderId) {
    if (confirm('Are you sure you want to cancel this order?')) {
        try {
            await makeApiRequest(`/orders/${orderId}/cancel`, 'POST');
            showNotification('success', 'Order cancelled successfully');
            fetchOrders();
        } catch (error) {
            showNotification('error', 'Failed to cancel order');
        }
    }
}

async function viewSubscriptionDetails(subId) {
    try {
        const subscription = await makeApiRequest(`/subscriptions/${subId}`);
        // Show subscription details in a modal or dedicated page
        console.log('Subscription details:', subscription);
        // You would implement the actual display logic here
    } catch (error) {
        showNotification('error', 'Failed to load subscription details');
    }
}

async function toggleSubscriptionPause(subId) {
    try {
        await makeApiRequest(`/subscriptions/${subId}/toggle-pause`, 'POST');
        showNotification('success', 'Subscription status updated');
        fetchSubscriptions();
    } catch (error) {
        showNotification('error', 'Failed to update subscription');
    }
}

async function cancelSubscription(subId) {
    if (confirm('Are you sure you want to cancel this subscription?')) {
        try {
            await makeApiRequest(`/subscriptions/${subId}/cancel`, 'POST');
            showNotification('success', 'Subscription cancelled successfully');
            fetchSubscriptions();
        } catch (error) {
            showNotification('error', 'Failed to cancel subscription');
        }
    }
}

function exportData(type) {
    // Implement export functionality (CSV, PDF, etc.)
    console.log(`Exporting ${type} data...`);
    // This would typically generate a file download
}

function initCharts(chartData) {
    // Initialize charts using Chart.js or similar library
    console.log('Initializing charts with data:', chartData);
    // You would implement the actual chart rendering here
}

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}