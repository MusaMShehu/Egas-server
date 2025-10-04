    // Tab switching functionality
    document.addEventListener('DOMContentLoaded', function() {
        const tabs = document.querySelectorAll('.settings-tab-btn');
        const tabContents = document.querySelectorAll('.settings-tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('border-blue-500', 'text-blue-600'));
                tabContents.forEach(c => c.classList.add('hidden'));
                
                // Add active class to clicked tab
                this.classList.add('border-blue-500', 'text-blue-600');
                
                // Show corresponding content
                const tabId = this.getAttribute('data-tab');
                document.getElementById(tabId).classList.remove('hidden');
            });
        });
        
        // Delivery zones management
        const addZoneBtn = document.getElementById('add-zone-btn');
        const zonesContainer = document.getElementById('delivery-zones-container');
        
        if (addZoneBtn && zonesContainer) {
            addZoneBtn.addEventListener('click', function() {
                const zoneDiv = document.createElement('div');
                zoneDiv.className = 'flex items-center mb-2';
                zoneDiv.innerHTML = `
                    <input type="text" name="delivery_zones[]" class="form-input mr-2" placeholder="Zone name">
                    <button type="button" class="btn btn-danger remove-zone-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                zonesContainer.appendChild(zoneDiv);
                
                // Add event listener to new remove button
                zoneDiv.querySelector('.remove-zone-btn').addEventListener('click', function() {
                    zonesContainer.removeChild(zoneDiv);
                });
            });
            
            // Add event listeners to existing remove buttons
            document.querySelectorAll('.remove-zone-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    zonesContainer.removeChild(this.parentElement);
                });
            });
        }
        
        // Form submissions
        const forms = [
            'payment-settings-form',
            'notification-settings-form',
            'delivery-settings-form',
            'security-settings-form'
        ];
        
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const data = Object.fromEntries(formData.entries());
                    
                    // In a real app, you would send this to your API
                    console.log(`Saving ${formId} data:`, data);
                    
                    // Show success message
                    alert('Settings saved successfully!');
                });
            }
        });
    });