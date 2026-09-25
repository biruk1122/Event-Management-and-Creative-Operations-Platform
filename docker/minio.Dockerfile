FROM golang:1.24.8-bookworm AS build

# The former public MinIO registry images and legacy binary downloads are no
# longer available. Build the same pinned community release from its source.
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/minio/minio@RELEASE.2025-09-07T16-13-09Z

FROM alpine:3.21

COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data"]
