/**
 * assets/js/patrol.js
 * Handle komunikasi API khusus untuk Fitur Patroli
 */

const PatrolAPI = {
    baseUrl: "http://caraka-biroumumpbj.kemendikdasmen.go.id/api",

    /**
     * Mengirim Laporan Patroli
     * @param {string} token - Token user dari localStorage
     * @param {object} data - Payload { latitude, longitude, note, image }
     */
    submitReport: async function(token, data) {
        console.log("Mengirim laporan patroli...", data);

        try {
            // Sesuai dokumentasi API: POST /api/patrol.php
            const response = await fetch(`${this.baseUrl}/patrol.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    latitude: data.latitude,
                    longitude: data.longitude,
                    note: data.note,
                    image: data.image // Base64 string
                })
            });

            if (!response.ok) {
                console.error("Server Error:", response.status);
                throw new Error(`Server Error: ${response.status}`);
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error("Patrol API Error:", error);
            return {
                status: 'error',
                message: 'Gagal menghubungi server. Periksa koneksi internet Anda.'
            };
        }
    }
};

// Expose ke Global Window
window.PatrolAPI = PatrolAPI;