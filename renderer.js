// renderer.js

// Tworzenie aplikacji Vue.js
const app = Vue.createApp({
    data() {
        return {
            // Domyślne ustawienia dla aplikacji
            selectedYear: new Date().getFullYear(),  // wybrane lata
            selectedType: 'monthly',  // wybrany typ (miesięczny/tygodniowy/roczny)
            selectedTab: 'sales',  // wybrana zakładka
            years: Array.from({length: new Date().getFullYear() - 2009 + 1}, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a),  // tablica lat
            data: [],  // dane z serwera
            months: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],  // nazwy miesięcy
            orderColumns: ['Miesiąc', 'BEST (EUR)', 'LAUF (EUR)', 'SWG (PLN)'],  // kolumny dla zamówień
            products: [],  // lista wszystkich kodów produktów
            selectedProduct: null,  // wybrany kod produktu
            productFilter: '',  // filtr dla kodów produktów
            productDescription: '',  // opis wybranego produktu
            productDescriptionSOD: '',  // opis wybranego produktu z sod
            ordersData: [],  // dane zamówień dla wybranego produktu
            filteredOrdersData: [],  // dane zamówień dla wybranego produktu po filtrowaniu
            LensesOrdersColumns: ['Bestellung', 'Klient', 'Data', 'Ilość', 'Cena', 'Wartość'],  // kolumny dla tabeli zamówień
            salesData: [],  // dane sprzedaży dla wybranego produktu
            filteredSalesData: [],  // dane sprzedaży dla wybranego produktu po filtrowaniu
            LensesSalesColumns: ['Bestellung', 'Klient', 'Data', 'Ilość', 'Cena', 'Wartość'],  // kolumny dla tabeli sprzedaży
            selectedStartDate: null,  // wybrana data początkowa
            selectedEndDate: null,  // wybrana data końcowa
            availableFiles: [],  // lista dostępnych plików
            clients: [],  // lista klientów
            selectedClient: null,  // wybrany klient
            clientFilter: '',  // filtr dla klientów
            clientTransactions: [],  // transakcje klienta
            clientTransactionsColumns: ['Kod_Towaru', 'Zamówione', 'Wysłane'],  // kolumny dla tabeli transakcji klienta
            sort: {
                column: null,
                ascending: true
            }, // sortowanie
            selectedStartMonth: null, // wybrany początkowy miesiąc
            selectedEndMonth: null, // wybrany końcowy miesiąc
            selectedStartWeek: null, // wybrany początkowy tydzień
            selectedEndWeek: null, // wybrany końcowy tydzień
            selectedStartYear: null, // wybrany początkowy rok
            selectedEndYear: null, // wybrany końcowy rok
            weeks: Array.from({length: 52}, (_, i) => i + 1), // tablica tygodni
            selectedGlass: null, // wybrana szkło
            glassFilter: '', // filtr dla szkieł
            glassSearch: '', // szukane szkło
            glasses: [], // lista szkieł
            lenses: [], // lista soczewek
            LensesColumns: ['Soczewka'], // kolumny dla tabeli soczewek
        }
    },
    watch: {
        // Funkcje wywoływane przy zmianie obserwowanych wartości
        selectedYear() {
            if (this.selectedType === 'weekly' || this.selectedType === 'monthly') {
                this.fetchData()  // Pobierz dane przy zmianie roku
            }
        },
        selectedType() {
            if (this.selectedType === 'weekly' || this.selectedType === 'monthly' || this.selectedType === 'yearly') {
                this.fetchData()  // Pobierz dane przy zmianie typu (miesięczny/tygodniowy/roczny)
            } else if (this.selectedType === 'monthly-calendar' || this.selectedType === 'weekly-calendar') {
                this.data = [];
            }
            this.updateColumns();  // Zaktualizuj kolumny
        },
        selectedTab() {
            if (this.selectedTab === 'sales' || this.selectedTab === 'orders') {
                if (this.selectedType === 'weekly' || this.selectedType === 'monthly' || this.selectedType === 'yearly') {
                    this.fetchData()  // Pobierz dane przy zmianie zakładki
                } else if (this.selectedType === 'monthly-calendar' || this.selectedType === 'weekly-calendar') {
                    this.data = [];
                }
            }else if (this.selectedTab === 'lenses') {
                this.fetchProducts();
            }else if (this.selectedTab === 'client') {
                this.fetchClients();
            }
        },
        selectedProduct: {
            handler(newVal, oldVal) {
                if (newVal !== oldVal) {
                    this.fetchOrdersData();
                    this.fetchSalesData();  // pobranie danych o sprzedaży
                    this.fetchProductDescription();
                    this.fetchProductDescriptionSOD();
                    this.fetchAvailableFiles();
                    this.sort.column = null;
                }
            },
            immediate: true,
        },
        selectedStartDate: function (newVal, oldVal) {
            this.filterData();
            if (this.selectedTab === 'client') {
                if (this.selectedStartDate && this.selectedEndDate) {
                    this.fetchClientTransactionsData();
                }
            }
        },
        selectedEndDate: function (newVal, oldVal) {
            this.filterData();
            if (this.selectedTab === 'client') {
                if (this.selectedStartDate && this.selectedEndDate) {
                    this.fetchClientTransactionsData();
                }
            }
        },
        selectedClient: {
            handler(newVal, oldVal) {
                if (newVal !== oldVal) {
                    this.fetchClientTransactionsData();
                    this.sort.column = null;
                }
            }
        },
        selectedGlass: {
            handler(newVal, oldVal) {
                this.glassSearch = newVal;
            }
        },
        glassSearch: {
            handler(newVal, oldVal) {
                if (newVal !== oldVal) {
                    this.getLenses();
                }
            }
        }
    },
    created() {
        this.fetchData();  // Pobierz dane na początku
        this.getGlasses();
    },
    methods: {
        // Metoda do pobierania danych
        async fetchData() {
            let url = `http://localhost:3000/data/${this.selectedYear}/${this.selectedType}`
            if (this.selectedTab === 'orders') {
                url = `http://localhost:3000/orders/${this.selectedYear}/${this.selectedType}`
            }
            try {
                const response = await axios.get(url)
                this.data = response.data
                this.sort.column = null;
            } catch (err) {
                console.error(err)
            }
        },
        // Metoda do formatowania liczb
        formatNumber(value) {
            if (!value || isNaN(value)) return '-';
            const num = parseFloat(value);
            return num.toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        },
        // Aktualizacja kolumn
        updateColumns() {
            let periodColumn;
            if (this.selectedType === 'monthly') {
                periodColumn = 'Miesiąc';
            } else if (this.selectedType === 'weekly') {
                periodColumn = 'Tydzień';
            } else if (this.selectedType === 'yearly') {
                periodColumn = 'Rok';
            } else if (this.selectedType === 'monthly-calendar') {
                periodColumn = 'Miesiąc_Rok';
            } else if (this.selectedType === 'weekly-calendar') {
                periodColumn = 'Tydzień_Rok';
            }
            this.orderColumns = [periodColumn, 'BEST (EUR)', 'LAUF (EUR)', 'SWG (PLN)'];
            this.sort.column = null;
        },
        async fetchProducts() {
            const url = 'http://localhost:3000/products';
            try {
                const response = await axios.get(url);
                this.products = response.data;
            } catch (err) {
                console.error(err);
            }
        },
        async fetchOrdersData() {
            try {
                const res = await axios.get(`http://localhost:3000/product-orders/${this.selectedProduct}`);
                this.ordersData = res.data;
                this.filterData();
            } catch (err) {
                console.error(err);
                this.ordersData = [];
            }
        },
        formatDate(value) {
            if (!value) return '-';
            const date = new Date(value);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');  // JavaScript zwraca miesiące od 0 do 11
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        },
        formatCurrency(value) {
            if (!value || isNaN(value)) return '-';
            const num = parseFloat(value);
            return num.toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        },
        async fetchProductDescription() {
            try {
                const res = await axios.get(`http://localhost:3000/product-description/${this.selectedProduct}`);
                this.productDescription = res.data[0].nazwa_towaru;
            } catch (err) {
                console.error(err);
                this.productDescription = '';
            }
        },
        async fetchProductDescriptionSOD() {
            try {
                const res = await axios.get(`http://localhost:3000/sod-opis/${this.selectedProduct}`);
                this.productDescriptionSOD = res.data[0].Opis.replace(/\n/g, '<br>');
            } catch (err) {
                console.error(err);
                this.productDescriptionSOD = '';
            }
        },
        async fetchSalesData() {
            try {
                const res = await axios.get(`http://localhost:3000/product-sales/${this.selectedProduct}`);
                this.salesData = res.data;
                this.filterData();
            } catch (err) {
                console.error(err);
                this.salesData = [];
            }
        },
        filterData() {
            if (this.selectedStartDate && this.selectedEndDate) {
                const startDate = new Date(this.selectedStartDate);
                const endDate = new Date(this.selectedEndDate);

                this.filteredSalesData = this.salesData.filter(sale => {
                    const saleDate = new Date(sale.Data);
                    return saleDate >= startDate && saleDate <= endDate;
                });
                this.filteredOrdersData = this.ordersData.filter(order => {
                    const orderDate = new Date(order.Data);
                    return orderDate >= startDate && orderDate <= endDate;
                });
            } else {
                this.filteredSalesData = [...this.salesData];  // jeśli daty nie są wybrane, wyświetlamy wszystkie dane
                this.filteredOrdersData = [...this.ordersData];
            }
        },
        async fetchAvailableFiles() {
            try {
                const res = await axios.get(`http://localhost:3000/available-files/${this.selectedProduct}`);
                this.availableFiles = res.data;
            } catch (err) {
                console.error(err);
                this.availableFiles = [];
            }
        },
        async fetchClients() {
            const url = 'http://localhost:3000/customers';
            try {
                const response = await axios.get(url);
                this.clients = response.data;
            } catch (err) {
                console.error(err);
            }
        },
        async fetchClientTransactionsData() {
            try {
                const params = {};
                if (this.selectedStartDate && this.selectedEndDate) {
                    params.startDate = this.selectedStartDate;
                    params.endDate = this.selectedEndDate;
                }
                const res = await axios.get(`http://localhost:3000/customer-transactions/${this.selectedClient}`, {
                    params: params
                });
                this.clientTransactions = res.data;
                this.sort.column = null;
            } catch (err) {
                console.error(err);
                this.clientTransactions = [];
            }
        },
        showLens(kodTowaru) {
            this.selectedProduct = kodTowaru;
            this.selectedTab = 'lenses';
            this.fetchProductDescription();
            this.fetchProductDescriptionSOD();
            this.fetchSalesData();
            this.fetchOrdersData();
            this.fetchAvailableFiles();
        },
        showClient(client) {
            this.selectedClient = client;
            this.selectedTab = 'client';
            this.fetchClientTransactionsData();
        },
        sortByColumn(column, table) {
            // Przełączanie trybu sortowania
            if (this.sort.column === column) {
                this.sort.ascending = !this.sort.ascending;
            } else {
                this.sort.column = column;
                this.sort.ascending = true;
            }
            // Sortowanie tablicy
            if (table === 'client') {
                this.sortTable(this.clientTransactions, column)
            } else if (table === 'lenses') {
                this.sortTable(this.filteredOrdersData, column)
                this.sortTable(this.filteredSalesData, column)
            } else if (table === 'orders') {
                this.sortTable(this.transformedData, column)
            } else if (table === 'sales') {
                this.sortTable(this.transformedData, column)
            } else if (table === 'glass') {
                this.sortTable(this.lenses, column)
            }
        },
        sortTable(data, column) {
            isMonth = column === 'Miesiąc';
            isWeek = column === 'Tydzień';
            isMonthYearFormat = column === 'Miesiąc_Rok';
            isWeekYearFormat = column === 'Tydzień_Rok';
            if (column === 'Miesiąc' || column === 'Tydzień' || column === 'Rok' || column === 'Miesiąc_Rok' || column === 'Tydzień_Rok') {
                column = 'period';
            }
            data.sort((a, b) => {
                const valueA = a[column] || '0';
                const valueB = b[column] || '0';

                if (isMonth) {
                    const indexA = this.months.indexOf(valueA);
                    const indexB = this.months.indexOf(valueB);
                    return this.sort.ascending ? indexA - indexB : indexB - indexA;
                } else if (isWeek) {
                    const weekNumA = parseInt(valueA.split(' ')[1]) || 0;
                    const weekNumB = parseInt(valueB.split(' ')[1]) || 0;
                    return this.sort.ascending ? weekNumA - weekNumB : weekNumB - weekNumA;
                } else if (isMonthYearFormat) {
                    const [monthA, yearA] = valueA.split('-').map(Number);
                    const [monthB, yearB] = valueB.split('-').map(Number);
                    const dateA = new Date(yearA, monthA - 1);
                    const dateB = new Date(yearB, monthB - 1);
                    return this.sort.ascending ? dateA - dateB : dateB - dateA;
                } else if (isWeekYearFormat) {
                    const [weekA, yearA] = valueA.split('-').map(Number);
                    const [weekB, yearB] = valueB.split('-').map(Number);
                    const dateA = new Date(yearA, 0, 1 + (weekA - 1) * 7);
                    const dateB = new Date(yearB, 0, 1 + (weekB - 1) * 7);
                    return this.sort.ascending ? dateA - dateB : dateB - dateA;
                }

                // Próbuj zamienić na liczbę; jeśli się nie uda, użyj oryginalnej wartości
                const numA = isNaN(parseFloat(valueA)) ? valueA : parseFloat(valueA);
                const numB = isNaN(parseFloat(valueB)) ? valueB : parseFloat(valueB);

                // Porównaj jako liczby, jeśli obie wartości są liczbami; w przeciwnym razie porównaj jako ciągi znaków
                if (typeof numA === 'number' && typeof numB === 'number') {
                    return this.sort.ascending ? numA - numB : numB - numA;
                } else {
                    return this.sort.ascending ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
                }
            });
        },
        // Funkcja do pobierania miesięcznej sprzedaży pod datach
        async getMonthlyCalendar() {
            // convert month to number
            let monthStart = this.months.indexOf(this.selectedStartMonth) + 1;
            let monthEnd = this.months.indexOf(this.selectedEndMonth) + 1;
            let url = '';
            if (this.selectedTab === 'sales') {
                url = `http://localhost:3000/sales-months-calendar/${monthStart}/${this.selectedStartYear}/${monthEnd}/${this.selectedEndYear}`
            } else if (this.selectedTab === 'orders') {
                url = `http://localhost:3000/orders-months-calendar/${monthStart}/${this.selectedStartYear}/${monthEnd}/${this.selectedEndYear}`
            }
            try {
                const response = await axios.get(url)
                this.data = response.data
                this.sort.column = null;
            } catch (err) {
                console.error(err)
            }
        },
        // Funkcja do pobierania tygodniowej sprzedaży pod datach
        async getWeeklyCalendar() {
            let url = '';
            if (this.selectedTab === 'sales') {
                url = `http://localhost:3000/sales-weeks-calendar/${this.selectedStartWeek}/${this.selectedStartYear}/${this.selectedEndWeek}/${this.selectedEndYear}`
            } else if (this.selectedTab === 'orders') {
                url = `http://localhost:3000/orders-weeks-calendar/${this.selectedStartWeek}/${this.selectedStartYear}/${this.selectedEndWeek}/${this.selectedEndYear}`
            }
            try {
                const response = await axios.get(url)
                this.data = response.data
                this.sort.column = null;
            } catch (err) {
                console.error(err)
            }
        },
        // Funkcja do odczytu soczewek na podstawie szkła
        async getLenses() {
            try {
                const response = await axios.get(`http://localhost:3000/sod-lens-from-glass/${this.glassSearch}`)
                this.lenses = response.data
            } catch (err) {
                console.error(err)
            }
        },
        // Funkcja do odczytu szkieł
        async getGlasses(){
            try {
                const response = await axios.get(`http://localhost:3000/glasses`)
                this.glasses = response.data.glasses
                console.log(this.glasses)
            } catch (err) {
                console.error(err)
            }
        },
    },
    computed: {
        // Obliczenia dla dynamicznych kolumn
        columns() {
            return this.orderColumns;
        },
        // Transformacja danych do wygodnego formatu
        transformedData() {
            const data = {}
            this.data.forEach(item => {
                let periodKey;
                if (this.selectedType === 'monthly') {
                    periodKey = this.months[item.Miesiąc - 1];
                } else if (this.selectedType === 'weekly') {
                    periodKey = 'Tydzień ' + item.Tydzień;
                } else if (this.selectedType === 'yearly') {
                    periodKey = item.Rok;
                } else if (this.selectedType === 'monthly-calendar') {
                    periodKey = item.Miesiąc_Rok;
                } else if (this.selectedType === 'weekly-calendar') {
                    periodKey = item.Tydzień_Rok;
                }
                if (!data[periodKey]) {
                    data[periodKey] = {period: periodKey}
                }
                let waluta = '(EUR)';
                if (item.Seria === "SWG") waluta = '(PLN)'
                data[periodKey][item.Seria + ' ' + waluta] = parseFloat(item.Kwota).toFixed(2)
            })

            let result = Object.values(data);

            if (this.selectedType === 'yearly') {
                // sortowanie danych rocznych w kolejności malejącej
                result.sort((a, b) => b.period - a.period);
            }
            return result;
        },
        // Obliczenie sumy dla każdej kolumny
        total() {
            const total = {}
            this.columns.slice(1).forEach(column => {
                let sum = this.transformedData.reduce((sum, row) => sum + parseFloat(row[column] || 0), 0);
                total[column] = sum.toFixed(2);
            })
            return total;
        },
        // Obliczanie sumy dla kolumny 'Ilość' i 'Wartość' w tabelach zamówień
        ordersTotal() {
            const total = { Ilość: 0, Wartość: 0 }
            this.filteredOrdersData.forEach(row => {
                total.Ilość += parseFloat(row['Ilość']) || 0;
                total.Wartość += parseFloat(row['Wartość']) || 0;
            })
            return total;
        },
        // Obliczanie sumy dla kolumny 'Ilość' i 'Wartość' w tabelach sprzedaży
        salesTotal() {
            const total = { Ilość: 0, Wartość: 0 }
            this.filteredSalesData.forEach(row => {
                total.Ilość += parseFloat(row['Ilość']) || 0;
                total.Wartość += parseFloat(row['Wartość']) || 0;
            })
            return total;
        },
        clientTransactionsTotal() {
            const total = { Zamówione: 0, Wysłane: 0 }
            this.clientTransactions.forEach(row => {
                total.Zamówione += parseFloat(row['Zamówione']) || 0;
                total.Wysłane += parseFloat(row['Wysłane']) || 0;
            })
            return total;
        },
        filteredProducts() {
            return this.products.filter(product => product.Kod_Towaru.toLowerCase().includes(this.productFilter.toLowerCase()));
        },
        filteredClients() {
            return this.clients.filter(client => client.Atr_Wartosc.toLowerCase().includes(this.clientFilter.toLowerCase()));
        },
        filteredGlasses() {
            return this.glasses.filter(glass => glass.toLowerCase().includes(this.glassFilter.toLowerCase()));
        }
    }
})

// Montowanie aplikacji Vue.js
app.mount('#app')
