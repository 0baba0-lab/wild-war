using UnityEngine;
using UnityEngine.Tilemaps;

[RequireComponent(typeof(Camera))]
public class MapCamera : MonoBehaviour
{
    public Tilemap tilemap;

    private const float EdgeWidth = 24f;
    private const float MoveSpeed = 12f;

    private Camera viewCamera;
    private Vector3 mapMin;
    private Vector3 mapMax;

    private void Awake()
    {
        viewCamera = GetComponent<Camera>();
        if (tilemap == null)
        {
            enabled = false;
            return;
        }

        // 마지막 칸 다음 좌표에는 바깥쪽 여백도 들어 있으므로 그 여백을 뺀다.
        BoundsInt cells = tilemap.cellBounds;
        Grid grid = tilemap.layoutGrid;
        mapMin = tilemap.CellToWorld(cells.min);
        mapMax = tilemap.CellToWorld(cells.max) - grid.transform.TransformVector(grid.cellGap);
    }

    private void Update()
    {
        Vector2 direction = Vector2.zero;
        Rect view = viewCamera.pixelRect;
        Vector2 mouse = Input.mousePosition;

        // 게임 화면 안쪽 가장자리에 마우스가 있을 때만 이동한다.
        if (Application.isFocused && view.Contains(mouse))
        {
            if (mouse.x < view.xMin + EdgeWidth) direction.x = -1f;
            if (mouse.x >= view.xMax - EdgeWidth) direction.x = 1f;
            if (mouse.y < view.yMin + EdgeWidth) direction.y = -1f;
            if (mouse.y >= view.yMax - EdgeWidth) direction.y = 1f;
        }

        Vector3 position = transform.position + (Vector3)direction.normalized * (MoveSpeed * Time.deltaTime);
        float halfHeight = viewCamera.orthographicSize;
        float halfWidth = halfHeight * viewCamera.aspect;

        // 카메라 화면 양끝이 맵 밖으로 나가지 않도록 중심의 이동 범위를 구한다.
        position.x = KeepInside(position.x, mapMin.x, mapMax.x, halfWidth);
        position.y = KeepInside(position.y, mapMin.y, mapMax.y, halfHeight);
        transform.position = position;
    }

    private static float KeepInside(float position, float mapStart, float mapEnd, float viewHalfSize)
    {
        float firstCenter = mapStart + viewHalfSize;
        float lastCenter = mapEnd - viewHalfSize;
        return firstCenter <= lastCenter
            ? Mathf.Clamp(position, firstCenter, lastCenter)
            : (mapStart + mapEnd) / 2f;
    }
}
