using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

public static class MapTilemapGenerator
{
    private const int MapSize = 9;

    // Unity에서 이 메뉴를 누르면 바로 아래 함수가 실행된다.
    [MenuItem("Tools/Wild War/Create Grid")]
    private static void CreateGrid()
    {
        // Hierarchy에 빈 오브젝트를 만들고 Grid 설정을 붙인다.
        GameObject map = new GameObject("Map_9x9");
        Grid grid = map.AddComponent<Grid>();

        // 기존 네모 그림에 맞춰 칸 크기를 1×1, 칸 사이 틈을 0.1로 정한다.
        grid.cellSize = new Vector3(1f, 1f, 0f);
        grid.cellGap = new Vector3(0.1f, 0.1f, 0f);

        // 가로와 세로를 3배로 키워 실제 칸 크기를 3×3, 틈을 0.3으로 만든다.
        map.transform.localScale = new Vector3(3f, 3f, 1f);

        // Ctrl+Z로 방금 만든 격자를 되돌릴 수 있게 한다.
        Undo.RegisterCreatedObjectUndo(map, "Create Map Grid");
    }

    [MenuItem("Tools/Wild War/맵 생성기")]
    private static void Fill9x9()
    {
        // Hierarchy에서 선택한 격자를 가져온다.
        GameObject map = Selection.activeGameObject;
        if (map == null || !map.TryGetComponent<Grid>(out _))
        {
            return;
        }

        // 같은 네모 타일을 한 번 불러와 모든 칸에 사용한다.
        TileBase squareTile = AssetDatabase.LoadAssetAtPath<TileBase>("Assets/Tiles/Square.asset");
        if (squareTile == null)
        {
            Debug.LogError("Assets/Tiles/Square.asset에서 타일을 찾지 못했습니다.");
            return;
        }

        // GroundTiles가 이미 있으면 찾아서 쓰고, 없으면 새로 만든다.
        Transform ground = map.transform.Find("GroundTiles");
        if (ground == null)
        {
            ground = new GameObject(
                "GroundTiles", typeof(Tilemap), typeof(TilemapRenderer)).transform;
            ground.SetParent(map.transform, false);
            Undo.RegisterCreatedObjectUndo(ground.gameObject, "Create Ground Tiles");
        }

        Tilemap tilemap = ground.GetComponent<Tilemap>();
        Undo.RegisterCompleteObjectUndo(tilemap, "Fill 9x9");

        // 왼쪽 아래 (0, 0)부터 오른쪽 위 (8, 8)까지 채운다.
        for (int y = 0; y < MapSize; y++)
        {
            for (int x = 0; x < MapSize; x++)
            {
                tilemap.SetTile(new Vector3Int(x, y, 0), squareTile);
            }
        }

        tilemap.CompressBounds();
        PlaceLabels(tilemap);
        SetUpCamera(tilemap);
    }

    private static void PlaceLabels(Tilemap tilemap)
    {
        Transform labels = tilemap.transform.Find("Tile Coordinates");
        if (labels != null)
        {
            return;
        }

        labels = new GameObject("Tile Coordinates").transform;
        labels.SetParent(tilemap.transform, false);
        Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        TilemapRenderer tileRenderer = tilemap.GetComponent<TilemapRenderer>();

        // 화면에 보여주는 좌표는 1부터 시작한다.
        for (int y = 0; y < MapSize; y++)
        {
            for (int x = 0; x < MapSize; x++)
            {
                string caption = $"({x + 1}, {y + 1})";
                var label = new GameObject(caption);
                label.transform.SetParent(labels, false);
                label.transform.position = tilemap.GetCellCenterWorld(new Vector3Int(x, y, 0));

                TextMesh text = label.AddComponent<TextMesh>();
                text.text = caption;
                text.font = font;
                text.fontSize = 48;
                text.characterSize = 0.03f;
                text.anchor = TextAnchor.MiddleCenter;
                text.alignment = TextAlignment.Center;
                text.color = Color.black;

                MeshRenderer renderer = label.GetComponent<MeshRenderer>();
                renderer.sharedMaterial = font.material;
                renderer.sortingLayerID = tileRenderer.sortingLayerID;
                renderer.sortingOrder = tileRenderer.sortingOrder + 1;
            }
        }

        Undo.RegisterCreatedObjectUndo(labels.gameObject, "Place Tile Coordinates");
    }

    private static void SetUpCamera(Tilemap tilemap)
    {
        Camera camera = Camera.main;
        if (camera == null)
        {
            return;
        }

        // 가운데 칸 (4, 4)는 화면에서 (5, 5)로 표시된다.
        Vector3 center = tilemap.GetCellCenterWorld(new Vector3Int(MapSize / 2, MapSize / 2, 0));
        Undo.RecordObject(camera.transform, "Center Map Camera");
        camera.transform.position = new Vector3(center.x, center.y, camera.transform.position.z);

        if (!camera.TryGetComponent(out MapCamera mapCamera))
        {
            mapCamera = Undo.AddComponent<MapCamera>(camera.gameObject);
        }

        Undo.RecordObject(mapCamera, "Assign Camera Tilemap");
        mapCamera.tilemap = tilemap;
    }
}
