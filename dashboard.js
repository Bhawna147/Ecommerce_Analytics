document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('https://gist.githubusercontent.com/Bhawna147/8c34c3e12da58f192589c4dbb86eb7ef/raw');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();

    processData(jsonData);
  } catch (error) {
    console.error('Error fetching data:', error);
    document.querySelector('.container').innerHTML += `
            <div style="color: red; padding: 20px; text-align: center;">
                <p>Error loading data. Please ensure you are running this on a local server.</p>
                <p>Try running: <code>python3 -m http.server</code> in the terminal.</p>
                <p>Error details: ${error.message}</p>
            </div>
        `;
  }
});

function processData(data) {
  const dailyGroups = {}; // Order Date -> Map<SKU, ItemData>
  let totalQty = 0;

  const groups = data.data?.groups || [];

  groups.forEach(group => {
    const orders = group.orders || [];
    orders.forEach(order => {
      const orderDateISO = order.created_iso;
      const orderDate = orderDateISO ? new Date(orderDateISO).toLocaleDateString('en-GB', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      }) : 'Unknown Date';

      const subOrders = order.sub_orders || [];
      subOrders.forEach(item => {
        if (item.product_sku) {
          const sku = item.product_sku;
          const qty = item.quantity || 0;
          const image = item.image || 'https://via.placeholder.com/100?text=No+Image';
          const name = item.name || 'Unknown Product';
          const deliveryDateISO = item.expected_dispatch_date_iso;
          const deliveryDate = deliveryDateISO ? new Date(deliveryDateISO).toLocaleDateString('en-GB', {
            month: 'short', day: 'numeric'
          }) : 'TBD';

          totalQty += qty;

          if (!dailyGroups[orderDate]) {
            dailyGroups[orderDate] = {};
          }

          if (!dailyGroups[orderDate][sku]) {
            dailyGroups[orderDate][sku] = {
              sku,
              name,
              image,
              qty: 0,
              deliveryDates: new Set(),
              orderDateISO // Use the first one found for sorting
            };
          }

          // Aggregate
          dailyGroups[orderDate][sku].qty += qty;
          dailyGroups[orderDate][sku].deliveryDates.add(deliveryDate);
        }
      });
    });
  });

  // Update total count
  document.getElementById('total-qty').textContent = data.data?.count || totalQty;

  renderDetailedView(dailyGroups);
}

function renderDetailedView(dailyGroupsMap) {
  const statsSection = document.querySelector('.table-section .card');
  statsSection.innerHTML = '<h2>Order Breakdown</h2><div id="detailed-container"></div>';
  const detailedContainer = document.getElementById('detailed-container');

  // Sort dates
  const sortedDates = Object.keys(dailyGroupsMap).sort((a, b) => {
    // We need to access a sample item to get orderDateISO for sorting
    const sampleA = Object.values(dailyGroupsMap[a])[0];
    const sampleB = Object.values(dailyGroupsMap[b])[0];
    const dateA = new Date(sampleA?.orderDateISO || 0);
    const dateB = new Date(sampleB?.orderDateISO || 0);
    return dateA - dateB;
  });

  sortedDates.forEach(date => {
    const skuMap = dailyGroupsMap[date];
    const items = Object.values(skuMap);

    // Sort items by SKU
    items.sort((a, b) => a.sku.localeCompare(b.sku));

    const totalItemsInDate = items.reduce((sum, i) => sum + i.qty, 0);

    const dateBlock = document.createElement('div');
    dateBlock.className = 'date-block';

    dateBlock.innerHTML = `
            <div class="date-header">
                <h3>${date}</h3>
                <span class="item-count">${totalItemsInDate} Items</span>
            </div>
            <div class="items-grid">
                ${items.map(item => {
      const deliveryDatesStr = Array.from(item.deliveryDates).join(', ');
      return `
                    <div class="item-card">
                        <div class="card-header-stats">
                            <div class="qty-big">Quantity: ${item.qty}</div>
                            <div class="dispatch-date">
                                <span class="label">Dispatch</span>
                                <span class="value">${deliveryDatesStr}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="item-image">
                                <img src="${item.image}" alt="${item.sku}" loading="lazy">
                            </div>
                            <div class="item-details">
                                <h4>${item.sku}</h4>
                                <p class="product-name" title="${item.name}">${item.name}</p>
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;

    detailedContainer.appendChild(dateBlock);
  });

  // Hide chart section
  const chartSection = document.querySelector('.chart-section');
  if (chartSection) {
    chartSection.style.display = 'none';
  }
}