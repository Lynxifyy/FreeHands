#include <gtest/gtest.h>

#include <cstdint>
#include <vector>

#include "freehands/h264_parser.h"

namespace freehands {
namespace {

// Builds an Annex-B NAL with a 4-byte start code.
std::vector<uint8_t> nal(int type, size_t payload_len, uint8_t fill = 0xAB) {
  std::vector<uint8_t> out{0x00, 0x00, 0x00, 0x01};
  out.push_back(static_cast<uint8_t>(type & 0x1f));
  out.insert(out.end(), payload_len, fill);
  return out;
}

std::vector<uint8_t> concat(const std::vector<std::vector<uint8_t>>& parts) {
  std::vector<uint8_t> out;
  for (const auto& part : parts) {
    out.insert(out.end(), part.begin(), part.end());
  }
  return out;
}

TEST(H264ParserTest, ParsesTwoCompleteUnitsInOneBuffer) {
  H264Parser parser;
  std::vector<NalUnit> units;
  // The trailing IDR is only complete once a following start code arrives.
  const std::vector<uint8_t> stream =
      concat({nal(7, 4), nal(5, 8), nal(1, 2)});

  const size_t produced = parser.append(stream.data(), stream.size(), units);

  ASSERT_EQ(produced, 2u);
  EXPECT_EQ(units[0].type, 7);
  EXPECT_FALSE(units[0].keyframe);
  EXPECT_EQ(units[1].type, 5);
  EXPECT_TRUE(units[1].keyframe);
}

TEST(H264ParserTest, ReportsNalTypeAndRefIdcFromHeaderByte) {
  H264Parser parser;
  std::vector<NalUnit> units;
  // nal_ref_idc = 3 (0b11), type = 1 (non-IDR reference slice)
  std::vector<uint8_t> stream{0x00, 0x00, 0x00, 0x01, 0x61, 0x11, 0x22};
  const std::vector<uint8_t> terminator{0x00, 0x00, 0x00, 0x01, 0x09};

  parser.append(stream.data(), stream.size(), units);
  parser.append(terminator.data(), terminator.size(), units);

  ASSERT_EQ(units.size(), 1u);
  EXPECT_EQ(units[0].type, 1);
  EXPECT_EQ(units[0].nal_ref_idc, 3);
  EXPECT_FALSE(units[0].keyframe);
}

TEST(H264ParserTest, ReassemblesUnitSplitAcrossThreeAppends) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> whole = nal(5, 10);

  parser.append(whole.data(), 3, units);
  EXPECT_TRUE(units.empty());
  parser.append(whole.data() + 3, 5, units);
  EXPECT_TRUE(units.empty());
  // Final chunk has no following start code yet: unit is still pending.
  parser.append(whole.data() + 8, whole.size() - 8, units);
  EXPECT_TRUE(units.empty());
  EXPECT_GT(parser.pendingBytes(), 0u);

  // A following start code completes the buffered unit.
  const std::vector<uint8_t> next = nal(1, 2);
  parser.append(next.data(), next.size(), units);
  ASSERT_EQ(units.size(), 1u);
  EXPECT_EQ(units[0].type, 5);
  EXPECT_EQ(units[0].length, 11u);  // 1 header byte + 10 payload bytes
}

TEST(H264ParserTest, EmittedOffsetsPointAtTheNalPayload) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> stream =
      concat({nal(7, 3), nal(5, 4), nal(1, 2)});

  parser.append(stream.data(), stream.size(), units);
  ASSERT_EQ(units.size(), 2u);
  const uint8_t* base = parser.bufferData();
  EXPECT_EQ(base[units[0].offset], 0x07);
  EXPECT_EQ(base[units[1].offset], 0x05);
  EXPECT_EQ(units[0].length, 4u);
  EXPECT_EQ(units[1].length, 5u);
}

TEST(H264ParserTest, AcceptsThreeByteStartCodes) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> stream{0x00, 0x00, 0x01, 0x07, 0xAA,
                                    0x00, 0x00, 0x01, 0x05, 0xBB};

  const size_t produced = parser.append(stream.data(), stream.size(), units);
  ASSERT_EQ(produced, 1u);  // the trailing 05 unit is pending
  EXPECT_EQ(units[0].type, 7);
  EXPECT_EQ(units[0].length, 2u);

  parser.flush(units);
  ASSERT_EQ(units.size(), 2u);
  EXPECT_EQ(units[1].type, 5);
  EXPECT_TRUE(units[1].keyframe);
}

TEST(H264ParserTest, IgnoresBytesBeforeFirstStartCode) {
  H264Parser parser;
  std::vector<NalUnit> units;
  std::vector<uint8_t> stream{0xDE, 0xAD, 0xBE, 0xEF};
  const std::vector<uint8_t> unit = nal(5, 2);
  stream.insert(stream.end(), unit.begin(), unit.end());
  const std::vector<uint8_t> next = nal(1, 1);
  stream.insert(stream.end(), next.begin(), next.end());

  parser.append(stream.data(), stream.size(), units);
  ASSERT_EQ(units.size(), 1u);
  EXPECT_EQ(units[0].type, 5);
}

TEST(H264ParserTest, DetectsStartCodeStraddlingAppendBoundary) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> stream = concat({nal(5, 4), nal(1, 4)});

  // Split so the second start code lands across the two chunks.
  const size_t split = 7;  // inside the 00 00 00 01 of the second unit
  parser.append(stream.data(), split, units);
  parser.append(stream.data() + split, stream.size() - split, units);

  ASSERT_EQ(units.size(), 1u);
  EXPECT_EQ(units[0].type, 5);
}

TEST(H264ParserTest, DropsEmptyUnitsBetweenAdjacentStartCodes) {
  H264Parser parser;
  std::vector<NalUnit> units;
  // The first unit is empty (a start code immediately followed by another) and
  // must not be emitted. The remaining three units have payloads of 2, 1 and
  // 2 bytes; the last one completes only once a following start code arrives.
  const std::vector<uint8_t> stream{0x00, 0x00, 0x01, 0x00, 0x00, 0x01,
                                    0x09, 0xAA, 0x00, 0x00, 0x01, 0x09};
  const std::vector<uint8_t> next{0x00, 0x00, 0x01, 0x09, 0xBB,
                                  0x00, 0x00, 0x01, 0x09, 0xCC};

  parser.append(stream.data(), stream.size(), units);
  parser.append(next.data(), next.size(), units);

  ASSERT_EQ(units.size(), 3u);
  EXPECT_EQ(units[0].length, 2u);  // header byte + 0xAA
  EXPECT_EQ(units[1].length, 1u);  // header byte only
  EXPECT_EQ(units[2].length, 2u);  // header byte + 0xBB
  EXPECT_EQ(units[0].type, 9);
}

TEST(H264ParserTest, ResetDiscardsPartialUnit) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> stream = nal(5, 20);

  parser.append(stream.data(), stream.size(), units);
  EXPECT_TRUE(units.empty());
  parser.reset();
  EXPECT_EQ(parser.pendingBytes(), 0u);

  parser.flush(units);
  EXPECT_TRUE(units.empty());
}

TEST(H264ParserTest, FlushEmitsPendingUnit) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> stream = nal(5, 6);

  parser.append(stream.data(), stream.size(), units);
  ASSERT_TRUE(units.empty());
  ASSERT_TRUE(parser.flush(units));
  ASSERT_EQ(units.size(), 1u);
  EXPECT_EQ(units[0].type, 5);
  EXPECT_EQ(units[0].length, 7u);
}

TEST(H264ParserTest, FlushWithNoStartCodeReturnsFalse) {
  H264Parser parser;
  std::vector<NalUnit> units;
  const std::vector<uint8_t> junk{0x01, 0x02, 0x03, 0x04};

  parser.append(junk.data(), junk.size(), units);
  EXPECT_FALSE(parser.flush(units));
}

TEST(H264ParserTest, HandlesNullAndEmptyInput) {
  H264Parser parser;
  std::vector<NalUnit> units;
  EXPECT_EQ(parser.append(nullptr, 0, units), 0u);
  EXPECT_EQ(parser.append(nullptr, 10, units), 0u);
  const std::vector<uint8_t> empty;
  EXPECT_EQ(parser.append(empty.data(), 0, units), 0u);
  EXPECT_TRUE(units.empty());
}

TEST(H264ParserTest, FindStartCodeLocatesPrefixAtOffset) {
  const std::vector<uint8_t> data{0xAA, 0x00, 0x00, 0x01, 0xBB};
  EXPECT_EQ(H264Parser::findStartCode(data.data(), data.size(), 0), 1);
  EXPECT_EQ(H264Parser::findStartCode(data.data(), data.size(), 2),
            H264Parser::kNoStartCode);
  EXPECT_EQ(H264Parser::findStartCode(data.data(), 2, 0),
            H264Parser::kNoStartCode);
}

TEST(H264ParserTest, NalTypeMasksLowFiveBits) {
  EXPECT_EQ(H264Parser::nalType(0xE5), 5);
  EXPECT_EQ(H264Parser::nalType(0x67), 7);
  EXPECT_EQ(H264Parser::nalType(0xFF), 31);
}

}  // namespace
}  // namespace freehands
