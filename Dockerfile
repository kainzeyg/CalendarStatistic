FROM golang:1.22.2-alpine AS builder

RUN apk add --no-cache gcc musl-dev git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /go-calendar

FROM alpine:latest
RUN apk add --no-cache sqlite
COPY --from=builder /go-calendar /go-calendar
COPY static /static
EXPOSE 8080
CMD ["/go-calendar"]