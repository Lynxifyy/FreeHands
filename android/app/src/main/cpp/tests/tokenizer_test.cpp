#include "freehands/tokenizer.h"

#include <gtest/gtest.h>

namespace freehands {
namespace {

// The SentencePiece boundary marker, U+2581. Built as a named constant rather
// than written inline, because a C++ hex escape runs on into any following hex
// digit: kBoundary + "ab" is not the marker followed by "ab".
const std::string kBoundary = "\xE2\x96\x81";

Tokenizer build(const std::vector<std::string>& pieces) {
  return Tokenizer::fromPieces(pieces);
}

TEST(TokenizerTest, EncodesAKnownWordToItsPiece) {
  // The boundary marker prefixes the first piece of a word.
  const Tokenizer tokenizer = build({kBoundary + "hello"});

  const std::vector<int32_t> ids = tokenizer.encode("hello");

  ASSERT_EQ(1u, ids.size());
  EXPECT_EQ(0, ids[0]);
}

TEST(TokenizerTest, MarksEachWordBoundary) {
  const Tokenizer tokenizer = build({kBoundary + "hello", kBoundary + "world"});

  const std::vector<int32_t> ids = tokenizer.encode("hello world");

  ASSERT_EQ(2u, ids.size());
  EXPECT_EQ(0, ids[0]);
  EXPECT_EQ(1, ids[1]);
}

TEST(TokenizerTest, PrefersTheLongestMatchingPiece) {
  const Tokenizer tokenizer = build({kBoundary + "ab", kBoundary + "abc"});

  const std::vector<int32_t> ids = tokenizer.encode("abc");

  ASSERT_EQ(1u, ids.size());
  EXPECT_EQ(1, ids[0]);
}

TEST(TokenizerTest, FallsBackToABytePieceWhenNoWordPieceMatches) {
  Tokenizer tokenizer = build({kBoundary + "hello", "<0x21>"});
  ASSERT_EQ(1u, tokenizer.registerByteFallbacks());

  const std::vector<int32_t> ids = tokenizer.encode("hello!");

  ASSERT_EQ(2u, ids.size());
  EXPECT_EQ(0, ids[0]);
  EXPECT_EQ(1, ids[1]);
}

TEST(TokenizerTest, DropsBytesWithNoPieceAndNoFallback) {
  const Tokenizer tokenizer = build({kBoundary + "hello"});

  const std::vector<int32_t> ids = tokenizer.encode("hello~");

  ASSERT_EQ(1u, ids.size());
  EXPECT_EQ(0, ids[0]);
}

TEST(TokenizerTest, DecodesBackToTheOriginalText) {
  const Tokenizer tokenizer = build({kBoundary + "hello", kBoundary + "world"});

  const std::string text = tokenizer.decode({0, 1});

  EXPECT_EQ("hello world", text);
}

TEST(TokenizerTest, DecodeIgnoresUnknownIds) {
  const Tokenizer tokenizer = build({kBoundary + "hi"});

  EXPECT_EQ("hi", tokenizer.decode({0, 999, -1}));
}

TEST(TokenizerTest, AnEmptyVocabularyEncodesToNothing) {
  const Tokenizer tokenizer;

  EXPECT_TRUE(tokenizer.empty());
  EXPECT_TRUE(tokenizer.encode("anything").empty());
}

TEST(TokenizerTest, RoundTripsATwoWordSentence) {
  const Tokenizer tokenizer = build({kBoundary + "tap", kBoundary + "the", kBoundary + "button"});

  const std::string original = "tap the button";
  EXPECT_EQ(original, tokenizer.decode(tokenizer.encode(original)));
}

TEST(TokenizerTest, PieceStripsTheBoundaryMarkerForDisplay) {
  const Tokenizer tokenizer = build({kBoundary + "hello"});

  EXPECT_EQ("hello", tokenizer.piece(0));
  EXPECT_EQ("", tokenizer.piece(5));
}

}  // namespace
}  // namespace freehands
