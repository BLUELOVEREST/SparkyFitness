export async function searchGrocyFoods(
  _query: string,
  _baseUrl: string | undefined,
  _appKey: string | undefined,
  page = 1,
  pageSize = 20
) {
  return {
    foods: [],
    pagination: {
      page,
      pageSize,
      totalCount: 0,
      hasMore: false,
    },
  };
}

export async function getGrocyFoodDetails() {
  throw Object.assign(
    new Error('Grocy food details are not implemented for this provider yet'),
    { status: 501 }
  );
}
