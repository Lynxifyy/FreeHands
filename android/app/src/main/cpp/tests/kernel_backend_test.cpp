#include "freehands/kernel_backend.h"

#include <gtest/gtest.h>

namespace freehands {
namespace {

// A 2x2 identity matrix times a 2x2 matrix returns the matrix.
TEST(KernelBackendTest, MatmulMatchesTheReferenceProduct) {
  const float a[] = {1.0f, 2.0f, 3.0f, 4.0f};
  const float b[] = {1.0f, 0.0f, 0.0f, 1.0f};
  float out[4] = {0.0f, 0.0f, 0.0f, 0.0f};

  CpuKernelBackend::reference().matmul(
      MatrixView{a, 2, 2}, MatrixView{b, 2, 2}, out);

  EXPECT_FLOAT_EQ(1.0f, out[0]);
  EXPECT_FLOAT_EQ(2.0f, out[1]);
  EXPECT_FLOAT_EQ(3.0f, out[2]);
  EXPECT_FLOAT_EQ(4.0f, out[3]);
}

TEST(KernelBackendTest, MatmulMultipliesRowsByColumns) {
  // a = [1 2 3] (1x3), b stored [2, 3] so each row is an output column.
  const float a[] = {1.0f, 2.0f, 3.0f};
  const float b[] = {1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f};
  float out[2] = {0.0f, 0.0f};

  CpuKernelBackend::reference().matmul(MatrixView{a, 1, 3}, MatrixView{b, 2, 3}, out);

  EXPECT_FLOAT_EQ(1.0f, out[0]);
  EXPECT_FLOAT_EQ(2.0f, out[1]);
}

TEST(KernelBackendTest, MatmulIgnoresInvalidViews) {
  const float a[] = {1.0f};
  float out[1] = {42.0f};

  CpuKernelBackend::reference().matmul(MatrixView{a, 0, 0}, MatrixView{a, 0, 0}, out);
  CpuKernelBackend::reference().matmul(MatrixView{a, 1, 1}, MatrixView{a, 1, 1}, nullptr);

  EXPECT_FLOAT_EQ(42.0f, out[0]);
}

TEST(KernelBackendTest, AxpyAccumulatesTheScaledProduct) {
  float y[] = {1.0f, 1.0f};
  const float x[] = {2.0f, 4.0f};
  const float w[] = {3.0f, 5.0f};
  const float b[] = {1.0f, -1.0f};

  CpuKernelBackend::reference().axpy(y, x, w, b, 2, 1.0f);

  EXPECT_FLOAT_EQ(8.0f, y[0]);   // 1 + (2*3 + 1)
  EXPECT_FLOAT_EQ(20.0f, y[1]);  // 1 + (4*5 - 1)
}

TEST(KernelBackendTest, AxpyAppliesTheScaleAndToleratesNoBias) {
  float y[] = {0.0f};
  const float x[] = {2.0f};
  const float w[] = {3.0f};

  CpuKernelBackend::reference().axpy(y, x, w, nullptr, 1, 0.5f);

  EXPECT_FLOAT_EQ(3.0f, y[0]);
}

TEST(KernelBackendTest, NamesTheReferenceBackend) {
  EXPECT_STREQ("cpu", CpuKernelBackend::reference().name());
}

}  // namespace
}  // namespace freehands
