// --- CONFIGURATION ---
const QTY_URL = 'https://gist.githubusercontent.com/Bhawna147/8c34c3e12da58f192589c4dbb86eb7ef/raw';
const INVENTORY_URL = 'inventory.json'; // Replace with Gist URL later

// Global State
let globalOrders = [];
let globalInventory = {}; // Will contain { inventory: {}, recipes: {} }

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Navigation Logic
  setupNavigation();

  // 2. Data Fetching
  try {
    const [qtyData, inventoryData] = await fetchData();
    globalOrders = extractActiveOrders(qtyData);
    globalInventory = inventoryData || { inventory: {}, recipes: {} };

    // 3. Process & Render
    processDashboard(qtyData);
    renderInventoryTable();
    populateSkuSelect();

    // 5. SKU Quick Add Logic
    setupQuickAdd();
  } catch (error) {
    console.error('Error initializing:', error);
    showError(error.message);
  }

  // 4. Export Button Logic
  document.getElementById('btn-export-inventory').addEventListener('click', generateInventoryExport);
});

function setupNavigation() {
  const dashBtn = document.getElementById('tab-dashboard');
  const invBtn = document.getElementById('tab-inventory');
  const dashView = document.getElementById('dashboard-view');
  const invView = document.getElementById('inventory-view');

  dashBtn.addEventListener('click', () => {
    dashBtn.classList.add('active');
    invBtn.classList.remove('active');
    dashView.style.display = 'block';
    invView.style.display = 'none';
  });

  invBtn.addEventListener('click', () => {
    invBtn.classList.add('active');
    dashBtn.classList.remove('active');
    invView.style.display = 'block';
    dashView.style.display = 'none';
    renderInventoryTable(); // Re-render to ensure inputs are fresh
  });
}

function setupQuickAdd() {
  const select = document.getElementById('sku-select');
  const btn = document.getElementById('btn-add-sku-stock');
  const input = document.getElementById('sku-add-qty');
  const preview = document.getElementById('quick-add-preview');

  // Handle Add
  btn.addEventListener('click', () => {
    const sku = select.value;
    const qty = parseInt(input.value) || 0;

    if (qty <= 0) return;

    // Use fetched recipes
    const recipes = globalInventory.recipes || {};
    const ingredients = recipes[sku];

    if (!ingredients) {
      alert(`No recipe found for SKU: ${sku}`);
      return;
    }

    const addedItems = [];
    if (!globalInventory.inventory) globalInventory.inventory = {};

    Object.entries(ingredients).forEach(([mat, count]) => {
      const toAdd = count * qty;
      globalInventory.inventory[mat] = (globalInventory.inventory[mat] || 0) + toAdd;
      addedItems.push(`${toAdd} ${mat}`);
    });

    preview.textContent = `Added: ${addedItems.join(', ')}`;

    // Clear message after 3s
    setTimeout(() => { preview.textContent = ''; }, 3000);

    // Re-render table
    renderInventoryTable();
  });
}

function populateSkuSelect() {
  const select = document.getElementById('sku-select');
  select.innerHTML = ''; // Clear existing
  const recipes = globalInventory.recipes || {};

  Object.keys(recipes).forEach(sku => {
    const option = document.createElement('option');
    option.value = sku;
    option.textContent = sku;
    select.appendChild(option);
  });
}

async function fetchData() {
  // Parallel fetch
  const [qtyRes, invRes] = await Promise.all([
    fetch(QTY_URL),
    fetch(INVENTORY_URL).catch(() => ({ ok: true, json: () => ({ inventory: {}, recipes: {} }) }))
  ]);

  if (!qtyRes.ok) throw new Error(`Orders fetch failed: ${qtyRes.status}`);

  const qtyJson = await qtyRes.json();

  let invJson = { inventory: {}, recipes: {} };
  if (invRes.ok) {
    try {
      invJson = await invRes.json();
    } catch (e) {
      console.warn('Inventory JSON parse error, using empty defaults', e);
    }
  }

  return [qtyJson, invJson];
}

function extractActiveOrders(data) {
  const orders = [];
  const groups = data.data?.groups || [];
  groups.forEach(group => {
    (group.orders || []).forEach(order => {
      (order.sub_orders || []).forEach(sub => {
        if (sub.product_sku && sub.quantity > 0) {
          orders.push({
            sku: sub.product_sku,
            qty: sub.quantity
          });
        }
      });
    });
  });
  return orders;
}

function calculateRequiredMaterials() {
  const required = {};
  const recipes = globalInventory.recipes || {};

  globalOrders.forEach(order => {
    const ingredients = recipes[order.sku];
    if (ingredients) {
      Object.entries(ingredients).forEach(([material, countPerUnit]) => {
        const totalNeeded = countPerUnit * order.qty;
        required[material] = (required[material] || 0) + totalNeeded;
      });
    }
  });

  return required;
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-body');
  if (!tbody) return;

  const requiredMap = calculateRequiredMaterials();
  const currentStock = globalInventory.inventory || {};

  // Merge all known materials (from Inventory AND Required)
  const allMaterials = new Set([
    ...Object.keys(currentStock),
    ...Object.keys(requiredMap)
  ]);

  const sortedMaterials = Array.from(allMaterials).sort();

  tbody.innerHTML = sortedMaterials.map(mat => {
    const Stock = currentStock[mat] || 0;
    const Required = requiredMap[mat] || 0;
    const Balance = Stock - Required;

    let statusClass = 'status-ok';
    if (Balance < 0) statusClass = 'status-critical';
    else if (Balance < 10) statusClass = 'status-low';

    return `
            <tr>
                <td>${mat}</td>
                <td>
                    <input type="number" 
                           value="${Stock}" 
                           onchange="updateStock('${mat}', this.value)"
                           min="0"
                    >
                </td>
                <td>${Required}</td>
                <td class="${statusClass}">${Balance}</td>
            </tr>
        `;
  }).join('');
}

// Exposed to global scope for the inline onchange handler
window.updateStock = (material, value) => {
  if (!globalInventory.inventory) globalInventory.inventory = {};
  globalInventory.inventory[material] = parseInt(value) || 0;
  renderInventoryTable(); // Re-calc balance
};

function generateInventoryExport() {
  const requiredMap = calculateRequiredMaterials();
  const newInventory = {};

  // We want to export BOTH inventory and recipes so the user doesn't lose recipes if they paste back.
  // Actually, usually user just pastes "inventory" block? 
  // If the user pastes the WHOLE file, we should export the WHOLE file structure.

  const currentStock = globalInventory.inventory || {};
  const recipes = globalInventory.recipes || {};

  // Calculate New Stock = Old Stock - Required
  Object.keys(currentStock).forEach(mat => {
    const current = currentStock[mat] || 0;
    const used = requiredMap[mat] || 0;
    newInventory[mat] = Math.max(0, current - used);
  });

  // Ensure all materials in `requiredMap` are also in `newInventory` (even if 0 or negative/missing)
  Object.keys(requiredMap).forEach(mat => {
    if (!(mat in newInventory)) {
      // If we didn't have it in stock but it was required, it's effectively 0 (or negative if we tracked backorders)
      newInventory[mat] = 0;
    }
  });

  const exportData = {
    inventory: newInventory,
    recipes: recipes
  };

  const exportString = JSON.stringify(exportData, null, 2);

  // Copy to clipboard or show modal
  navigator.clipboard.writeText(exportString).then(() => {
    alert("New Inventory JSON (with updated stock & recipes) copied to clipboard!\n\nPaste this into your 'inventory.json' Gist.");
  }).catch(err => {
    console.error('Failed to copy', err);
    prompt("Copy this JSON:", exportString);
  });
}

function showError(msg) {
  document.querySelector('.container').innerHTML += `
        <div style="color: red; padding: 20px; text-align: center;">
            <h3>Error</h3>
            <p>${msg}</p>
        </div>
    `;
}

// --- DASHBOARD LOGIC (Simplified from original) ---
function processDashboard(data) {
  const dailyGroups = {};
  let totalQty = 0;

  const groups = data.data?.groups || [];
  groups.forEach(group => {
    (group.orders || []).forEach(order => {
      const orderDateISO = order.created_iso;
      const orderDate = orderDateISO ? new Date(orderDateISO).toLocaleDateString('en-GB', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      }) : 'Unknown Date';

      (order.sub_orders || []).forEach(item => {
        if (item.product_sku) {
          const sku = item.product_sku;
          const qty = item.quantity || 0;
          const image = item.image || 'https://via.placeholder.com/100';
          const name = item.name || 'Unknown';
          const deliveryDateISO = item.expected_dispatch_date_iso;
          const deliveryDate = deliveryDateISO ? new Date(deliveryDateISO).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : 'TBD';

          totalQty += qty;

          if (!dailyGroups[orderDate]) dailyGroups[orderDate] = {};
          if (!dailyGroups[orderDate][sku]) {
            dailyGroups[orderDate][sku] = { sku, name, image, qty: 0, deliveryDates: new Set(), orderDateISO };
          }
          dailyGroups[orderDate][sku].qty += qty;
          dailyGroups[orderDate][sku].deliveryDates.add(deliveryDate);
        }
      });
    });
  });

  document.getElementById('total-qty').textContent = data.data?.count || totalQty;
  renderDetailedView(dailyGroups);
}

function renderDetailedView(dailyGroupsMap) {
  const detailedContainer = document.querySelector('.table-section .card');
  if (!detailedContainer) return;

  // Clear old content but keep title if possible, or just rebuild
  detailedContainer.innerHTML = '<h2>Detailed Breakdown</h2><div id="detailed-container"></div>';
  const container = document.getElementById('detailed-container');

  const sortedDates = Object.keys(dailyGroupsMap).sort((a, b) => {
    const dA = new Date(Object.values(dailyGroupsMap[a])[0]?.orderDateISO || 0);
    const dB = new Date(Object.values(dailyGroupsMap[b])[0]?.orderDateISO || 0);
    return dA - dB;
  });

  sortedDates.forEach(date => {
    const items = Object.values(dailyGroupsMap[date]).sort((a, b) => a.sku.localeCompare(b.sku));
    const totalItems = items.reduce((s, i) => s + i.qty, 0);

    const block = document.createElement('div');
    block.className = 'date-block';
    block.innerHTML = `
            <div class="date-header">
                <h3>${date}</h3>
                <span class="item-count">${totalItems} Items</span>
            </div>
            <div class="items-grid">
                ${items.map(item => `
                    <div class="item-card">
                        <div class="card-header-stats">
                            <div class="qty-big">x${item.qty}</div>
                            <div class="dispatch-date">
                                <span class="label">Dispatch</span>
                                <span class="value">${Array.from(item.deliveryDates).join(', ')}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="item-image"><img src="${item.image}" loading="lazy"></div>
                            <div class="item-details">
                                <h4>${item.sku}</h4>
                                <p class="product-name" title="${item.name}">${item.name}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    container.appendChild(block);
  });
}