// rendererFileDetails.js
// Tworzenie aplikacji Vue.js
const app = Vue.createApp({
    data() {
        return {
            fileDetails: [],
        }
    },
    watch: {

    },
    created() {

    },
    mounted() {
        this.getFileDetails();
    },
    methods: {
        async getFileDetails() {
            const queryParams = new URLSearchParams(window.location.search);
            const id = queryParams.get('id');

            console.log('Odczytany identyfikator:', id);
            const url = 'http://localhost:3000/fileDetails/' + id;
            try {
                const response = await axios.get(url);
                this.fileDetails = response.data;
            } catch (err) {
                console.error(err);
            }
            console.log('Odczytane szczegóły pliku:', this.fileDetails);
        }
    },
    computed: {
    }
})

// Montowanie aplikacji Vue.js
app.mount('#app')
