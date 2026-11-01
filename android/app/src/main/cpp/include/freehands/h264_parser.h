#ifndef FREEHANDS_H264_PARSER_H
#define FREEHANDS_H264_PARSER_H

#include <cstddef>
#include <cstdint>
#include <vector>

namespace freehands {

// A single NAL unit located inside an Annex-B byte stream.
struct NalUnit {
  // Byte offset of the NAL payload (first byte after the start code) inside
  // the parser's contiguous buffer.
  size_t offset = 0;
  // Length of the NAL payload in bytes, start code excluded.
  size_t length = 0;
  // H.264 nal_unit_type (low 5 bits of the NAL header).
  int type = 0;
  // NAL ref_idc (bits 5-6 of the NAL header); > 0 marks a reference frame.
  int nal_ref_idc = 0;
  // True when the unit is an IDR slice (type 5), i.e. a keyframe.
  bool keyframe = false;
};

// Incremental Annex-B H.264 parser.
//
// Screen captures arrive as a byte stream and a NAL may be split across
// buffers, so the parser keeps the trailing bytes of an incomplete unit and
// completes it on the next append. A unit is only known to be complete when
// the *next* start code is seen; the final unit of a stream is emitted by
// flush().
//
// Lifetime contract: offsets carried by emitted units point into the parser's
// buffer and stay valid until the next append()/flush()/reset() call. Bytes
// already emitted are compacted away at the start of the next append, not
// during the current one, so a caller can read unit payloads immediately.
class H264Parser {
 public:
  // A NAL unit larger than this is treated as corruption and dropped.
  static constexpr size_t kMaxNalSize = 8u * 1024u * 1024u;

  static constexpr int kNoStartCode = -1;

  // Appends |len| bytes and appends every NAL unit that became complete.
  // Returns the number of units appended to |out|.
  size_t append(const uint8_t* data, size_t len, std::vector<NalUnit>& out);

  // Emits the buffered trailing NAL as a unit (used when the stream ends).
  bool flush(std::vector<NalUnit>& out);

  // Discards buffered bytes. Call on stream restart so a torn frame from the
  // previous session cannot be emitted as part of the new one.
  void reset();

  // Bytes buffered but not yet emitted.
  size_t pendingBytes() const { return buffer_.size() - consumed_; }

  // Base pointer for the offsets carried by emitted units.
  const uint8_t* bufferData() const { return buffer_.data(); }

  // Copy of the buffered bytes. flush() clears the buffer, so a caller that
  // needs to read flushed payloads takes this snapshot first.
  std::vector<uint8_t> snapshot() const { return buffer_; }

  // Classifies a NAL header byte. Returns the unit type (0-31).
  static int nalType(uint8_t header) { return header & 0x1f; }

  // Finds the next 3- or 4-byte start code at or after |from|.
  // Returns the offset of the start code, or kNoStartCode.
  static int findStartCode(const uint8_t* data, size_t len, size_t from);

 private:
  // Emits every complete unit in the buffer and advances |consumed_|.
  void scanLocked(std::vector<NalUnit>& out);

  // Drops bytes already emitted, which invalidates previously emitted offsets.
  void compactLocked();

  std::vector<uint8_t> buffer_;
  size_t consumed_ = 0;
};

}  // namespace freehands

#endif  // FREEHANDS_H264_PARSER_H
