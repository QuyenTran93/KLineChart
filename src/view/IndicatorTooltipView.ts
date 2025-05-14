/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Crosshair from '../common/Crosshair'
import { type TooltipStyle, type TooltipTextStyle, type TooltipLegend, TooltipShowRule, type TooltipLegendChild, TooltipFeaturePosition, type TooltipFeatureStyle, TooltipFeatureType, type CandleTooltipRectStyle, PolygonType } from '../common/Styles'
import { ActionType } from '../common/Action'
import { formatPrecision } from '../common/utils/format'
import { isValid, isObject, isString, isNumber, isFunction } from '../common/utils/typeChecks'
import { createFont } from '../common/utils/canvas'
import type Coordinate from '../common/Coordinate'
import type Nullable from '../common/Nullable'

import type { YAxis } from '../component/YAxis'

import type { Indicator, IndicatorFigure, IndicatorFigureStyle, IndicatorTooltipData } from '../component/Indicator'
import { eachFigures, IndicatorEventTarget } from '../component/Indicator'

import type { TooltipFeatureInfo } from '../Store'

import View from './View'
import type { MeasureCoordinate } from '../common/Coordinate'

interface RectMeasured {
  x: number
  w: number
  h: number
}

export default class IndicatorTooltipView extends View<YAxis> {
  private readonly _boundFeatureClickEvent = (currentFeatureInfo: TooltipFeatureInfo) => () => {
    const pane = this.getWidget().getPane()
    const { indicator, ...others } = currentFeatureInfo
    if (isValid(indicator)) {
      indicator.onClick?.({
        target: IndicatorEventTarget.Feature,
        chart: pane.getChart(),
        indicator,
        ...others
      })
    } else {
      pane.getChart().getChartStore().executeAction(ActionType.OnCandleTooltipFeatureClick, currentFeatureInfo)
    }
    return true
  }

  private readonly _boundFeatureMouseMoveEvent = (currentFeatureInfo: TooltipFeatureInfo) => () => {
    this.getWidget().getPane().getChart().getChartStore().setActiveTooltipFeatureInfo(currentFeatureInfo)
    return true
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const crosshair = chartStore.getCrosshair()
    if (isValid(crosshair.kLineData)) {
      const bounding = widget.getBounding()
      const { offsetLeft, offsetTop, offsetRight } = chartStore.getStyles().indicator.tooltip
      this.drawIndicatorTooltip(
        ctx, offsetLeft, offsetTop,
        bounding.width - offsetRight
      )
    }
  }

  protected drawIndicatorTooltip (
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    maxWidth: number
  ): number {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const styles = chartStore.getStyles().indicator
    const tooltipStyles = styles.tooltip
    if (this.isDrawTooltip(chartStore.getCrosshair(), tooltipStyles)) {
      const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
      const tooltipTextStyles = tooltipStyles.text
      const defaultTooltipRectStyles = chartStore.getStyles().candle.tooltip.rect
      indicators.forEach(indicator => {
        let prevRowHeight = 0
        const coordinate = { x: left, y: top }
        const { name, calcParamsText, legends, features } = this.getIndicatorTooltipData(indicator)
        const nameValid = name.length > 0
        const legendValid = legends.length > 0
        if (nameValid || legendValid) {
          const [leftFeatures, middleFeatures, rightFeatures] = this.classifyTooltipFeatures(features)
          const [measureResult, prevCalcHeight] = this.drawStandardTooltipRect(ctx, leftFeatures, name, calcParamsText, middleFeatures, legends, rightFeatures, coordinate, maxWidth, tooltipTextStyles, defaultTooltipRectStyles)
          this.drawStandardTooltipFeatures(
            ctx, leftFeatures,
            indicator, measureResult[0] as Coordinate[]
          )

          if (nameValid) {
            let text = name
            if (calcParamsText.length > 0) {
              text = `${text}${calcParamsText}`
            }
            this.drawStandardTooltipLegends(
              ctx,
              [
                {
                  title: { text: '', color: tooltipTextStyles.color },
                  value: { text, color: tooltipTextStyles.color }
                }
              ],
              tooltipTextStyles,
              measureResult[1] as Array<[Coordinate, Coordinate]>
            )
          }

          this.drawStandardTooltipFeatures(
            ctx, middleFeatures,
            indicator, measureResult[2] as Coordinate[]
          )

          if (legendValid) {
            this.drawStandardTooltipLegends(
              ctx, legends, tooltipStyles.text, measureResult[3] as Array<[Coordinate, Coordinate]>
            )
          }

          // draw right icons
          this.drawStandardTooltipFeatures(
            ctx, rightFeatures,
            indicator, measureResult[4] as Coordinate[]
          )
          prevRowHeight = prevCalcHeight
          top = coordinate.y + prevRowHeight
        }
      })
    }
    return top
  }

  protected drawStandardTooltipFeatures (
    ctx: CanvasRenderingContext2D,
    features: TooltipFeatureStyle[],
    // coordinate: Coordinate,
    indicator: Nullable<Indicator>,
    // left: number,
    // prevRowHeight: number,
    // maxWidth: number
    measureResult: Coordinate[]
  ): void {
    if (features.length > 0) {
      // let width = 0
      // let height = 0
      // features.forEach(feature => {
      //   const {
      //     marginLeft = 0, marginTop = 0, marginRight = 0, marginBottom = 0,
      //     paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
      //     size = 0, type, iconFont
      //   } = feature
      //   let contentWidth = 0
      //   if (type === TooltipFeatureType.IconFont) {
      //     ctx.font = createFont(size, 'normal', iconFont.family)
      //     contentWidth = ctx.measureText(iconFont.content).width
      //   } else {
      //     contentWidth = size
      //   }
      //   width += (marginLeft + paddingLeft + contentWidth + paddingRight + marginRight)
      //   height = Math.max(height, marginTop + paddingTop + size + paddingBottom + marginBottom)
      // })
      // if (coordinate.x + width > maxWidth) {
      //   coordinate.x = left
      //   coordinate.y += prevRowHeight
      //   prevRowHeight = height
      // } else {
      //   prevRowHeight = Math.max(prevRowHeight, height)
      // }
      const pane = this.getWidget().getPane()
      const paneId = pane.getId()
      const activeFeatureInfo = pane.getChart().getChartStore().getActiveTooltipFeatureInfo()

      features.forEach((feature, index) => {
        const {
          // marginLeft = 0, marginTop = 0, marginRight = 0,
          paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
          backgroundColor, activeBackgroundColor, borderRadius,
          size = 0, color, activeColor, type, iconFont, path
        } = feature
        const active = activeFeatureInfo?.paneId === paneId && activeFeatureInfo.indicator?.id === indicator?.id && activeFeatureInfo.feature.id === feature.id

        // let contentWidth = 0
        const eventHandler = {
          mouseClickEvent: this._boundFeatureClickEvent({ paneId, indicator, feature }),
          mouseMoveEvent: this._boundFeatureMouseMoveEvent({ paneId, indicator, feature })
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        const finalColor = active ? (activeColor ?? color) : color
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        const finalBackgroundColor = active ? (activeBackgroundColor ?? backgroundColor) : backgroundColor
        if (type === TooltipFeatureType.IconFont) {
          this.createFigure({
            name: 'text',
            attrs: { text: iconFont.content, x: measureResult[index].x, y: measureResult[index].y },
            styles: {
              paddingLeft,
              paddingTop,
              paddingRight,
              paddingBottom,
              borderRadius,
              size,
              family: iconFont.family,
              color: finalColor,
              backgroundColor: finalBackgroundColor
            }
          }, eventHandler)?.draw(ctx)
          // contentWidth = ctx.measureText(iconFont.content).width
        } else {
          this.createFigure({
            name: 'rect',
            attrs: { x: measureResult[index].x, y: measureResult[index].y, width: size, height: size },
            styles: {
              paddingLeft,
              paddingTop,
              paddingRight,
              paddingBottom,
              color: finalBackgroundColor
            }
          }, eventHandler)?.draw(ctx)

          this.createFigure({
            name: 'path',
            attrs: { path: path.path, x: measureResult[index].x + paddingLeft, y: measureResult[index].y + paddingTop, width: size, height: size },
            styles: {
              style: path.style,
              lineWidth: path.lineWidth,
              color: finalColor
            }
          })?.draw(ctx)
          // contentWidth = size
        }
        // coordinate.x += (marginLeft + paddingLeft + contentWidth + paddingRight + marginRight)
      })
    }
    // return prevRowHeight
  }

  protected drawStandardTooltipLegends (
    ctx: CanvasRenderingContext2D,
    legends: TooltipLegend[],
    // coordinate: Coordinate,
    // left: number,
    // prevRowHeight: number,
    // maxWidth: number,
    styles: TooltipTextStyle,
    measureResult: Array<[Coordinate, Coordinate]>
  ): void {
    if (legends.length > 0) {
      // const { marginLeft, marginTop, marginRight, marginBottom, size, family, weight } = styles
      const { size, family, weight } = styles
      ctx.font = createFont(size, weight, family)
      legends.forEach((data, index) => {
        const title = data.title as TooltipLegendChild
        const value = data.value as TooltipLegendChild
        // const titleTextWidth = ctx.measureText(title.text).width
        // const valueTextWidth = ctx.measureText(value.text).width
        // const totalTextWidth = titleTextWidth + valueTextWidth
        // const h = marginTop + size + marginBottom
        // if (coordinate.x + marginLeft + totalTextWidth + marginRight > maxWidth) {
        //   coordinate.x = left
        //   coordinate.y += prevRowHeight
        //   prevRowHeight = h
        // } else {
        //   prevRowHeight = Math.max(prevRowHeight, h)
        // }
        if (title.text.length > 0) {
          this.createFigure({
            name: 'text',
            attrs: { x: measureResult[index][0].x, y: measureResult[index][0].y, text: title.text },
            styles: { color: title.color, size, family, weight }
          })?.draw(ctx)
        }
        this.createFigure({
          name: 'text',
          attrs: { x: measureResult[index][1].x, y: measureResult[index][1].y, text: value.text },
          styles: { color: value.color, size, family, weight }
        })?.draw(ctx)
        // coordinate.x += (marginLeft + totalTextWidth + marginRight)
      })
    }
    // return prevRowHeight
  }

  private updateRectSize (rectMeasured: RectMeasured, maxWidth: number, width: number, height: number): void {
    rectMeasured.w = Math.max(rectMeasured.w, rectMeasured.x + width)
    rectMeasured.h = Math.max(rectMeasured.h, height)
    if (rectMeasured.w > maxWidth) {
      rectMeasured.h += height
      rectMeasured.x = width
      rectMeasured.w -= width
    } else {
      rectMeasured.x += width
    }
  }

  private measurePositionFeatures (
    ctx: CanvasRenderingContext2D,
    coordinate: Coordinate,
    rectMeasured: RectMeasured,
    maxWidth: number,
    features: TooltipFeatureStyle[]
  ): Array<Coordinate | [Coordinate, Coordinate]> {
    const measureResult: Array<Coordinate | [Coordinate, Coordinate]> = []
    if (features.length > 0) {
      let elmWith = 0
      let elmHeight = 0
      features.forEach(feature => {
        const {
          marginLeft = 0, marginTop = 0, marginRight = 0, marginBottom = 0,
          paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
          size = 0, type, iconFont
        } = feature
        let contentWidth = 0
        if (type === TooltipFeatureType.IconFont) {
          ctx.font = createFont(size, 'normal', iconFont.family)
          contentWidth = ctx.measureText(iconFont.content).width
        } else {
          contentWidth = size
        }
        elmWith = marginLeft + paddingLeft + contentWidth + paddingRight + marginRight
        elmHeight = marginTop + paddingTop + size + paddingBottom + marginBottom
        this.updateRectSize(rectMeasured, maxWidth, elmWith, elmHeight)
        measureResult.push({
          x: coordinate.x + rectMeasured.x - elmWith + marginLeft,
          y: coordinate.y + rectMeasured.h - elmHeight + marginTop
        })
      })
    }
    return measureResult
  }

  private measurePositionLegends (
    ctx: CanvasRenderingContext2D,
    coordinate: Coordinate,
    rectMeasured: RectMeasured,
    maxWidth: number,
    legends: TooltipLegend[],
    styles: TooltipTextStyle
  ): Array<Coordinate | [Coordinate, Coordinate]> {
    const measureResult: Array<Coordinate | [Coordinate, Coordinate]> = []
    if (legends.length > 0) {
      const { marginLeft, marginTop, marginRight, marginBottom, size, family, weight } = styles
      ctx.font = createFont(size, weight, family)
      legends.forEach(data => {
        const title = data.title as TooltipLegendChild
        const value = data.value as TooltipLegendChild
        const titleTextWidth = ctx.measureText(title.text).width
        const valueTextWidth = ctx.measureText(value.text).width
        const totalTextWidth = titleTextWidth + valueTextWidth
        const elmWith = marginLeft + totalTextWidth + marginRight
        const h = marginTop + size + marginBottom
        this.updateRectSize(rectMeasured, maxWidth, elmWith, h)
        const measurePositionLegend: [Coordinate, Coordinate] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
        const x = coordinate.x + rectMeasured.x - elmWith + marginLeft
        const y = coordinate.y + rectMeasured.h - h + marginTop
        // measure position title legend
        if (title.text.length > 0) {
          measurePositionLegend[0].x = x
          measurePositionLegend[0].y = y
        }
        // measure position value legend
        measurePositionLegend[1].x = x + titleTextWidth
        measurePositionLegend[1].y = y
        measureResult.push(measurePositionLegend)
      })
    }
    return measureResult
  }

  protected drawStandardTooltipRect (
    ctx: CanvasRenderingContext2D,
    leftFeatures: TooltipFeatureStyle[],
    name: string,
    calcParamsText: string,
    middleFeatures: TooltipFeatureStyle[],
    legends: TooltipLegend[],
    rightFeatures: TooltipFeatureStyle[],
    coordinate: Coordinate, maxWidth: number, tooltipTextStyles: TooltipTextStyle, rectStyles: CandleTooltipRectStyle): [MeasureCoordinate, number] {
    const rectMeasured: RectMeasured = { x: 0, w: 0, h: 0 }

    const measureResult: MeasureCoordinate = []

    let partMeasureResult: Array<Coordinate | [Coordinate, Coordinate]> = []

    //  measure box left icons
    partMeasureResult = this.measurePositionFeatures(ctx, coordinate, rectMeasured, maxWidth, leftFeatures)

    measureResult.push(partMeasureResult)
    partMeasureResult = [] //  reset for new box

    //  measure box name
    if (name.length > 0) {
      let text = name
      if (calcParamsText.length > 0) {
        text = `${text}${calcParamsText}`
      }
      partMeasureResult = this.measurePositionLegends(
        ctx,
        coordinate,
        rectMeasured,
        maxWidth,
        [
          {
            title: { text: '', color: tooltipTextStyles.color },
            value: { text, color: tooltipTextStyles.color }
          }
        ],
        tooltipTextStyles
      )
    }

    measureResult.push(partMeasureResult)
    partMeasureResult = [] //  reset for new box

    //  measure box middle icons
    partMeasureResult = this.measurePositionFeatures(ctx, coordinate, rectMeasured, maxWidth, middleFeatures)

    measureResult.push(partMeasureResult)
    partMeasureResult = [] //  reset for new box

    //  measure box legends
    if (legends.length > 0) {
      partMeasureResult = this.measurePositionLegends(ctx, coordinate, rectMeasured, maxWidth, legends, tooltipTextStyles)
    }

    measureResult.push(partMeasureResult)
    partMeasureResult = [] //  reset for new box

    //  measure box right icons
    partMeasureResult = this.measurePositionFeatures(ctx, coordinate, rectMeasured, maxWidth, rightFeatures)

    measureResult.push(partMeasureResult)
    partMeasureResult = [] //  reset

    // only draw tooltip overlay with opacity if has opacity value
    if (typeof rectStyles.tooltipOverlayOpacity !== 'undefined' && rectStyles.tooltipOverlayOpacity > 0) {
      this.createFigure({
        name: 'rect',
        attrs: {
          x: coordinate.x,
          y: coordinate.y,
          width: rectMeasured.w,
          height: rectMeasured.h
        },
        styles: {
          style: PolygonType.Fill,
          color: rectStyles.color,
          borderColor: rectStyles.borderColor,
          borderSize: rectStyles.borderSize,
          borderRadius: rectStyles.borderRadius,
          tooltipOverlayOpacity: rectStyles.tooltipOverlayOpacity
        }
      })?.draw(ctx)
    }

    return [measureResult, rectMeasured.h]
  }

  protected isDrawTooltip (crosshair: Crosshair, styles: TooltipStyle): boolean {
    const showRule = styles.showRule
    return showRule === TooltipShowRule.Always ||
      (showRule === TooltipShowRule.FollowCross && isString(crosshair.paneId))
  }

  protected getIndicatorTooltipData (indicator: Indicator): IndicatorTooltipData {
    const chartStore = this.getWidget().getPane().getChart().getChartStore()
    const styles = chartStore.getStyles().indicator
    const tooltipStyles = styles.tooltip
    const name = tooltipStyles.showName ? indicator.shortName : ''
    let calcParamsText = ''
    if (tooltipStyles.showParams) {
      const calcParams = indicator.calcParams
      if (calcParams.length > 0) {
        calcParamsText = `(${calcParams.join(',')})`
      }
    }
    const tooltipData: IndicatorTooltipData = { name, calcParamsText, legends: [], features: tooltipStyles.features }

    const dataIndex = chartStore.getCrosshair().dataIndex!
    const result = indicator.result

    const customApi = chartStore.getCustomApi()
    const decimalFold = chartStore.getDecimalFold()
    const thousandsSeparator = chartStore.getThousandsSeparator()
    const legends: TooltipLegend[] = []
    if (indicator.visible) {
      const data = result[dataIndex] ?? result[dataIndex - 1] ?? {}
      eachFigures(indicator, dataIndex, styles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>) => {
        if (isString(figure.title)) {
          const color = figureStyles.color
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment  -- ignore
          let value = data[figure.key]
          if (isNumber(value)) {
            value = formatPrecision(value, indicator.precision)
            if (indicator.shouldFormatBigNumber) {
              value = customApi.formatBigNumber(value as string)
            }
            value = decimalFold.format(thousandsSeparator.format(value as string))
          }
          legends.push({ title: { text: figure.title, color }, value: { text: (value ?? tooltipStyles.defaultValue) as string, color } })
        }
      })
      tooltipData.legends = legends
    }

    if (isFunction(indicator.createTooltipDataSource)) {
      const widget = this.getWidget()
      const pane = widget.getPane()
      const chart = pane.getChart()
      const { name: customName, calcParamsText: customCalcParamsText, legends: customLegends, features: customFeatures } = indicator.createTooltipDataSource({
        chart,
        indicator,
        crosshair: chartStore.getCrosshair(),
        bounding: widget.getBounding(),
        xAxis: pane.getChart().getXAxisPane().getAxisComponent(),
        yAxis: pane.getAxisComponent()
      })
      if (isString(customName) && tooltipStyles.showName) {
        tooltipData.name = customName
      }
      if (isString(customCalcParamsText) && tooltipStyles.showParams) {
        tooltipData.calcParamsText = customCalcParamsText
      }
      if (isValid(customFeatures)) {
        tooltipData.features = customFeatures
      }
      if (isValid(customLegends) && indicator.visible) {
        const optimizedLegends: TooltipLegend[] = []
        const color = styles.tooltip.text.color
        customLegends.forEach(data => {
          let title = { text: '', color }
          if (isObject(data.title)) {
            title = data.title
          } else {
            title.text = data.title
          }
          let value = { text: '', color }
          if (isObject(data.value)) {
            value = data.value
          } else {
            value.text = data.value
          }
          if (isNumber(Number(value.text))) {
            value.text = decimalFold.format(thousandsSeparator.format(value.text))
          }
          optimizedLegends.push({ title, value })
        })
        tooltipData.legends = optimizedLegends
      }
    }
    return tooltipData
  }

  protected classifyTooltipFeatures (features: TooltipFeatureStyle[]): TooltipFeatureStyle[][] {
    const leftFeatures: TooltipFeatureStyle[] = []
    const middleFeatures: TooltipFeatureStyle[] = []
    const rightFeatures: TooltipFeatureStyle[] = []
    features.forEach(feature => {
      switch (feature.position) {
        case TooltipFeaturePosition.Left: {
          leftFeatures.push(feature)
          break
        }
        case TooltipFeaturePosition.Middle: {
          middleFeatures.push(feature)
          break
        }
        case TooltipFeaturePosition.Right: {
          rightFeatures.push(feature)
          break
        }
      }
    })
    return [leftFeatures, middleFeatures, rightFeatures]
  }
}
