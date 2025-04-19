package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Settings struct {
	WorkSchedule string    `json:"workSchedule"`
	WorkHours    WorkHours `json:"workHours"`
	Holidays     []Holiday `json:"holidays"`
}

type WorkHours struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type Holiday struct {
	Date string `json:"date"`
	Type string `json:"type"`
}

type Event struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Start       string `json:"start"`
	End         string `json:"end"`
	Type        string `json:"type"`
}

type TimeSummary struct {
	Type  string  `json:"type"`
	Hours float64 `json:"hours"`
	Name  string  `json:"name"`
}

var db *sql.DB

func handleSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		// Чтение настроек из файла или базы данных
		settings := Settings{
			WorkSchedule: "5/2",
			WorkHours: WorkHours{
				Start: "09:00",
				End:   "18:00",
			},
			Holidays: []Holiday{},
		}
		json.NewEncoder(w).Encode(settings)

	case "POST":
		var settings Settings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Здесь сохраняем настройки в базу данных или файл
		json.NewEncoder(w).Encode(settings)
	}
}

func main() {
	initDB()
	defer db.Close()

	http.Handle("/", http.FileServer(http.Dir("static")))
	http.HandleFunc("/api/events", handleEvents)
	http.HandleFunc("/api/events/", handleSingleEvent)
	http.HandleFunc("/api/stats", handleStats)
	http.HandleFunc("/api/settings", handleSettings)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server running on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./events.db")
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT,
			start TEXT NOT NULL,
			end TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'task'
		)
	`)
	if err != nil {
		log.Fatal(err)
	}
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	query := `
        SELECT 
            type, 
            SUM((julianday(end) - julianday(start)) * 24) as hours
        FROM events
        WHERE 1=1
    `

	args := []interface{}{}

	if startDate != "" {
		query += " AND datetime(start) >= datetime(?, 'start of day')"
		args = append(args, startDate)
	}

	if endDate != "" {
		query += " AND datetime(end) <= datetime(?, 'start of day', '+1 day', '-1 second')"
		args = append(args, endDate)
	}

	query += " GROUP BY type"

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("Database error: %v", err)
		http.Error(w, `{"error": "Database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var stats []TimeSummary
	typeNames := map[string]string{
		"task":    "Задачи",
		"meeting": "Встречи",
		"call":    "Звонки",
		"study":   "Учеба",
		"rest":    "Отдых",
	}

	for rows.Next() {
		var ts TimeSummary
		var hours sql.NullFloat64
		if err := rows.Scan(&ts.Type, &hours); err != nil {
			log.Printf("Data scan error: %v", err)
			http.Error(w, `{"error": "Data read error"}`, http.StatusInternalServerError)
			return
		}
		ts.Hours = math.Round(hours.Float64*10) / 10
		ts.Name = typeNames[ts.Type]
		stats = append(stats, ts)
	}

	if err := rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"error": "Data processing error"}`, http.StatusInternalServerError)
		return
	}

	// Ensure all types are present with zero values
	allTypes := []string{"task", "meeting", "call", "study", "rest"}
	if len(stats) == 0 {
		for _, t := range allTypes {
			stats = append(stats, TimeSummary{
				Type:  t,
				Hours: 0,
				Name:  typeNames[t],
			})
		}
	} else {
		// Add missing types with zero values
		for _, t := range allTypes {
			found := false
			for _, s := range stats {
				if s.Type == t {
					found = true
					break
				}
			}
			if !found {
				stats = append(stats, TimeSummary{
					Type:  t,
					Hours: 0,
					Name:  typeNames[t],
				})
			}
		}
	}

	if err := json.NewEncoder(w).Encode(stats); err != nil {
		log.Printf("JSON encode error: %v", err)
		http.Error(w, `{"error": "Response encoding error"}`, http.StatusInternalServerError)
	}
}

func handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	switch r.Method {
	case "GET":
		rows, err := db.Query("SELECT id, title, description, start, end, type FROM events ORDER BY start")
		if err != nil {
			sendError(w, "Ошибка базы данных", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var events []Event
		for rows.Next() {
			var e Event
			if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Start, &e.End, &e.Type); err != nil {
				sendError(w, "Ошибка чтения данных", http.StatusInternalServerError)
				return
			}
			events = append(events, e)
		}

		if events == nil {
			w.Write([]byte("[]"))
			return
		}
		json.NewEncoder(w).Encode(events)

	case "POST":
		var e Event
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			sendError(w, "Неверный формат данных", http.StatusBadRequest)
			return
		}

		e.ID = fmt.Sprintf("%d", time.Now().UnixNano())
		if e.Type == "" {
			e.Type = "task"
		}

		_, err := db.Exec(
			"INSERT INTO events (id, title, description, start, end, type) VALUES (?, ?, ?, ?, ?, ?)",
			e.ID, e.Title, e.Description, e.Start, e.End, e.Type,
		)
		if err != nil {
			sendError(w, "Ошибка сохранения", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(e)

	default:
		sendError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
	}
}

func handleSingleEvent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	id := strings.TrimPrefix(r.URL.Path, "/api/events/")
	if id == "" {
		sendError(w, "Требуется ID события", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "PUT":
		var e Event
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			sendError(w, "Неверный формат данных", http.StatusBadRequest)
			return
		}

		if e.Type == "" {
			e.Type = "task"
		}

		_, err := db.Exec(
			"UPDATE events SET title = ?, description = ?, start = ?, end = ?, type = ? WHERE id = ?",
			e.Title, e.Description, e.Start, e.End, e.Type, id,
		)
		if err != nil {
			sendError(w, "Ошибка обновления", http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(e)

	case "DELETE":
		_, err := db.Exec("DELETE FROM events WHERE id = ?", id)
		if err != nil {
			sendError(w, "Ошибка удаления", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)

	default:
		sendError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
	}
}

func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
