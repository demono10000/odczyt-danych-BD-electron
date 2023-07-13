// renderer.js

// Tworzenie aplikacji Vue.js
const app = Vue.createApp({
    data() {
        return {
            // Domyślne ustawienia dla aplikacji
            selectedYear: new Date().getFullYear(),  // wybrane lata
            selectedType: 'monthly',  // wybrany typ (miesięczny/tygodniowy)
            selectedTab: 'sales',  // wybrana zakładka
            years: Array.from({length: new Date().getFullYear() - 2009 + 1}, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a),  // tablica lat
            data: [],  // dane z serwera
            months: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],  // nazwy miesięcy
            orderColumns: ['Miesiąc', 'BEST (EUR)', 'LAUF (EUR)', 'SWG (PLN)'],  // kolumny dla zamówień
        }
    },
    watch: {
        // Funkcje wywoływane przy zmianie obserwowanych wartości
        selectedYear() {
            this.fetchData()  // Pobierz dane przy zmianie roku
        },
        selectedType() {
            this.fetchData()  // Pobierz dane przy zmianie typu (miesięczny/tygodniowy)
        },
        selectedTab() {
            this.fetchData()  // Pobierz dane przy zmianie zakładki
        }
    },
    created() {
        this.fetchData()  // Pobierz dane na początku
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
            } catch (err) {
                console.error(err)
            }
        },
        // Metoda do formatowania liczb
        formatNumber(value) {
            if (!value || isNaN(value)) return '-';
            const num = parseFloat(value);
            return num.toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }
    },
    computed: {
        // Obliczenia dla dynamicznych kolumn
        columns() {
            let periodColumn = this.selectedType === 'monthly' ? 'Miesiąc' : 'Tydzień';
            return [periodColumn, 'BEST (EUR)', 'LAUF (EUR)', 'SWG (PLN)'];
        },
        // Transformacja danych do wygodnego formatu
        transformedData() {
            const data = {}
            this.data.forEach(item => {
                let periodKey;
                if (this.selectedType === 'monthly') {
                    periodKey = this.months[item.Miesiac - 1];
                } else if (this.selectedType === 'weekly') {
                    periodKey = 'Tydzień ' + item.Tydzien;
                }
                if (!data[periodKey]) {
                    data[periodKey] = {period: periodKey}
                }
                let waluta = '(EUR)';
                if (item.Seria === "SWG") waluta = '(PLN)'
                data[periodKey][item.Seria + ' ' + waluta] = parseFloat(item.Kwota).toFixed(2)
            })
            console.log(Object.values(data))
            return Object.values(data)
        },
        // Obliczenie sumy dla każdej kolumny
        total() {
            const total = {}
            this.columns.slice(1).forEach(column => {
                let sum = this.transformedData.reduce((sum, row) => sum + parseFloat(row[column] || 0), 0);
                total[column] = sum.toFixed(2);
            })
            return total;
        }
    }
})

// Montowanie aplikacji Vue.js
app.mount('#app')
